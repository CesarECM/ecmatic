// MPS-20 S75.1 — Detectores KBI: generan kbi_sugerencias desde patrones observados.
// 4 detectores independientes, cada uno con límite MAX_POR_TIPO.
// El orquestador detectarSugerencias() los ejecuta en secuencia desde el cron diario.

import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { logSistema } from "@/services/log-sistema";

// Límite de sugerencias nuevas por detector por ciclo diario.
// Evita inundar el panel del admin con demasiadas sugerencias a la vez.
const MAX_POR_TIPO = 3;

const HACE_30_DIAS = () => new Date(Date.now() - 30 * 86_400_000).toISOString();
const HACE_7_DIAS  = () => new Date(Date.now() -  7 * 86_400_000).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// Devuelve true si ya existe una sugerencia pendiente para el mismo recurso y acción.
// Evita duplicados entre ejecuciones diarias del cron.
async function yaExistePendiente(db: DB, recursoId: string | null, tipoAccion: string): Promise<boolean> {
  let q = db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", tipoAccion)
    .eq("estado", "pendiente");
  if (recursoId) q = q.eq("recurso_id", recursoId);
  else           q = q.is("recurso_id", null);
  const { count } = await q;
  return (count ?? 0) > 0;
}

// ── Detector 1 — Baja confianza ───────────────────────────────────
// Primero intenta con kbi_senales (sistema nuevo). Si está vacío,
// usa score_confianza + score_uso de recursos_conocimiento (datos históricos).
async function detectarBajaConfianza(db: DB): Promise<number> {
  // Intento 1: datos KBI (disponibles después de acumular señales)
  const { data: agregados } = await db.rpc("kbi_agregar_senales");
  const hayKBI = (agregados?.length ?? 0) > 0;

  let candidatos: { id: string; titulo: string; contenido: string; razon: string }[] = [];

  if (hayKBI) {
    const filtrados = (agregados as { recurso_id: string; total_usos: number; total_cierres: number }[])
      .filter(a => a.total_usos >= 10 && a.total_cierres / a.total_usos < 0.20)
      .slice(0, MAX_POR_TIPO);

    const { data: recs } = await db.from("recursos_conocimiento")
      .select("id, titulo, contenido")
      .in("id", filtrados.map(c => c.recurso_id))
      .in("tipo", ["faq", "regla"])
      .eq("activo", true).eq("aprobado", true);

    candidatos = (recs ?? []).map((r: { id: string; titulo: string; contenido: string }) => {
      const agg = filtrados.find(f => f.recurso_id === r.id)!;
      const pct = Math.round((agg.total_cierres / agg.total_usos) * 100);
      return { ...r, razon: `Baja efectividad KBI: ${pct}% de conversión en ${agg.total_usos} usos.` };
    });
  } else {
    // Fallback: usar score_confianza histórico (< 0.35 con 5+ usos)
    const { data: recs } = await db.from("recursos_conocimiento")
      .select("id, titulo, contenido, score_confianza, score_uso")
      .in("tipo", ["faq", "regla"])
      .eq("activo", true).eq("aprobado", true)
      .lt("score_confianza", 0.35)
      .gte("score_uso", 5)
      .order("score_confianza", { ascending: true })
      .limit(MAX_POR_TIPO);

    candidatos = (recs ?? []).map((r: { id: string; titulo: string; contenido: string; score_confianza: number; score_uso: number }) => ({
      ...r,
      razon: `Baja confianza histórica: score ${Math.round(r.score_confianza * 100)}% con ${r.score_uso} usos. Contenido puede necesitar mejora.`,
    }));
  }

  let creados = 0;
  for (const r of candidatos) {
    if (await yaExistePendiente(db, r.id, "actualizar")) continue;
    await db.from("kbi_sugerencias").insert({
      recurso_id: r.id, tipo_accion: "actualizar",
      titulo_propuesto: r.titulo, contenido_propuesto: r.contenido,
      razon: r.razon, origen: "detector_confianza",
    });
    creados++;
  }
  return creados;
}

// ── Detector 2 — Sin uso ──────────────────────────────────────────
// Usa score_uso=0 de recursos_conocimiento (compatible desde el día 1).
// Si hay datos KBI, también excluye recursos que sí tienen señales nuevas.
async function detectarSinUso(db: DB): Promise<number> {
  // IDs que ya recibieron señales KBI (puede estar vacío al inicio)
  const { data: idsConUsoRaw } = await db.from("kbi_senales")
    .select("recurso_id").eq("tipo_senal", "uso");
  const idsConUso = new Set<string>((idsConUsoRaw ?? []).map((r: { recurso_id: string }) => r.recurso_id));

  // score_uso=0: nunca apareció en ninguna conversación (histórico + nuevo)
  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido, created_at")
    .in("tipo", ["faq", "regla"])
    .eq("activo", true).eq("aprobado", true)
    .eq("score_uso", 0)
    .lt("created_at", HACE_7_DIAS())  // al menos 7 días de vida antes de sugerir desactivar
    .order("created_at", { ascending: true })
    .limit(MAX_POR_TIPO * 3);

  const candidatos = (recursos ?? []).filter((r: { id: string }) => !idsConUso.has(r.id));
  let creados = 0;

  for (const r of candidatos.slice(0, MAX_POR_TIPO)) {
    if (await yaExistePendiente(db, r.id, "desactivar")) continue;
    await db.from("kbi_sugerencias").insert({
      recurso_id:          r.id,
      tipo_accion:         "desactivar",
      titulo_propuesto:    r.titulo,
      contenido_propuesto: r.contenido,
      razon:               `0 usos históricos desde su creación. ¿Sigue siendo relevante?`,
      origen:              "detector_confianza",
    });
    creados++;
  }
  return creados;
}

// ── Detector 3 — núcleo compartido ───────────────────────────────
// Procesa un único edit de ghl_approval_queue y genera la kbi_sugerencia.
// Usado tanto por el cron batch como por el trigger event-driven por item.
async function procesarUnEdit(db: DB, edit: {
  mensaje_ia: string | null;
  mensaje_final: string | null;
  razon_edicion: string | null;
  contexto: Record<string, unknown> | null;
}): Promise<boolean> {
  const mensajeFinal = edit.mensaje_final?.trim();
  const mensajeIA    = edit.mensaje_ia?.trim();
  const razon        = edit.razon_edicion?.trim();
  const ids          = (edit.contexto?.recursosIds as string[] | undefined) ?? [];

  if (!mensajeFinal) return false;

  if (ids.length > 0) {
    // ── Caso A: hay recurso KB — actualizar con la corrección del admin ──
    // Busca el primer recurso entre todos los ids que sea faq/regla y sin duplicado pendiente.
    const { data: recursos } = await db.from("recursos_conocimiento")
      .select("id, titulo, contenido")
      .in("id", ids)
      .in("tipo", ["faq", "regla"]) as { data: { id: string; titulo: string; contenido: string }[] | null };

    let recurso: { id: string; titulo: string; contenido: string } | null = null;
    for (const r of (recursos ?? [])) {
      if (!await yaExistePendiente(db, r.id, "actualizar")) { recurso = r; break; }
    }

    if (!recurso) return false;

    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 250,
      messages: [{ role: "user", content:
        `Eres editor de KB de un centro de certificaciones CONOCER México.
El admin corrigió una respuesta de IA. Actualiza el recurso KB con la información correcta.

IA respondió: "${mensajeIA?.slice(0, 250) ?? "(no disponible)"}"
Admin corrigió a: "${mensajeFinal.slice(0, 300)}"
${razon ? `Razón del admin: "${razon}"` : ""}

Recurso KB actual — Título: "${recurso.titulo}"
Contenido: ${recurso.contenido.slice(0, 250)}

Genera el contenido KB actualizado integrando la corrección.
JSON: {"contenido_nuevo": "..."}` }],
    });
    const raw  = (res.content[0] as { text: string }).text;
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { contenido_nuevo?: string };

    const razonDisplay = [
      razon ? `Feedback: "${razon}"` : null,
      `IA: "${mensajeIA?.slice(0, 80) ?? ""}…"`,
      `Corrección: "${mensajeFinal.slice(0, 80)}…"`,
    ].filter(Boolean).join("\n");

    await db.from("kbi_sugerencias").insert({
      recurso_id: recurso.id, tipo_accion: "actualizar",
      titulo_propuesto: recurso.titulo,
      contenido_propuesto: json.contenido_nuevo ?? mensajeFinal,
      razon: razonDisplay, origen: "detector_patron",
    });
    return true;

  } else {
    // ── Caso B: sin recurso KB — crear FAQ/Regla desde la corrección ──
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 250,
      messages: [{ role: "user", content:
        `Eres editor de KB de un centro de certificaciones CONOCER México.
El admin corrigió una respuesta de IA que no tenía recurso KB de base.
Extrae un recurso FAQ o Regla de la respuesta correcta del admin.

Respuesta correcta del admin: "${mensajeFinal.slice(0, 350)}"
${razon ? `Razón de la edición: "${razon}"` : ""}

JSON: {"tipo": "faq|regla", "titulo": "...", "contenido": "..."}
Si el contenido no amerita un recurso KB independiente, responde: {}` }],
    });
    const raw  = (res.content[0] as { text: string }).text;
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { tipo?: string; titulo?: string; contenido?: string };

    if (!json.titulo?.trim() || !json.contenido?.trim()) return false;

    await db.from("kbi_sugerencias").insert({
      recurso_id: null, tipo_accion: "crear",
      tipo_recurso_nuevo: json.tipo === "regla" ? "regla" : "faq",
      titulo_propuesto: json.titulo, contenido_propuesto: json.contenido,
      razon: `Sin KB de base. Admin corrigió IA${razon ? ` — "${razon}"` : ""}.\nCorrección: "${mensajeFinal.slice(0, 120)}…"`,
      origen: "detector_patron",
    });
    return true;
  }
}

// ── Detector 3 — cron batch (fallback) ────────────────────────────
// Solo procesa edits sin feedback_procesado: items no capturados por el trigger
// event-driven (fallo en after(), deployments anteriores, etc.).
async function detectarPatronGHL(db: DB): Promise<number> {
  const { data: edits } = await db.from("ghl_approval_queue")
    .select("id, mensaje_ia, mensaje_final, razon_edicion, contexto")
    .eq("estado", "editado")
    .eq("feedback_procesado", false)
    .gte("revisado_at", HACE_7_DIAS())
    .not("mensaje_final", "is", null)
    .limit(20);

  if (!edits?.length) return 0;

  let creados = 0;
  for (const edit of edits) {
    if (creados >= MAX_POR_TIPO) break;
    if (await procesarUnEdit(db, edit)) creados++;
  }
  return creados;
}

// ── Detector 3 — trigger event-driven ────────────────────────────
// Se llama desde editarAprobarMensajeGHLAction vía after() inmediatamente
// tras cada edición del admin. Procesa solo ese item y lo marca como procesado.
export async function detectarPatronGHLItem(itemId: string): Promise<void> {
  const db = createServiceClient() as DB;
  const traceId = crypto.randomUUID();

  void logSistema({ categoria: "ia", tipoAccion: "kbi.detector.patron_item", fase: "inicio", traceId, metadata: { itemId } });

  try {
    const { data: edit } = await db.from("ghl_approval_queue")
      .select("mensaje_ia, mensaje_final, razon_edicion, contexto")
      .eq("id", itemId)
      .eq("estado", "editado")
      .eq("feedback_procesado", false)
      .not("mensaje_final", "is", null)
      .maybeSingle();

    if (!edit) {
      void logSistema({ categoria: "ia", tipoAccion: "kbi.detector.patron_item", fase: "warn", traceId,
        resultado: "item no encontrado (ya procesado o estado incorrecto)", metadata: { itemId } });
      return;
    }

    const ids = (edit.contexto?.recursosIds as string[] | undefined) ?? [];
    const creado = await procesarUnEdit(db, edit);

    await db.from("ghl_approval_queue")
      .update({ feedback_procesado: true, feedback_procesado_at: new Date().toISOString() })
      .eq("id", itemId);

    void logSistema({ categoria: "ia", tipoAccion: "kbi.detector.patron_item", fase: "ok", traceId,
      resultado: creado ? "sugerencia creada" : "sin sugerencia (Claude descartó o duplicado)",
      metadata: { itemId, caso: ids.length > 0 ? "A" : "B", recurso_ids: ids } });
  } catch (err) {
    void logSistema({
      categoria: "ia", tipoAccion: "kbi.detector.patron_item", fase: "error", traceId,
      resultado: err instanceof Error ? err.message : String(err),
      metadata: { itemId },
    });
  }
}

// ── Detector 4 — Huecos de cobertura ─────────────────────────────
// Lee mensajes entrantes; si no hay, usa cuerpos de mensajes GHL como fuente.
// Corrige bug: yaExistePendiente no se usa en el loop (bloquearía todas las iteraciones).
async function detectarHuecosCobertura(db: DB): Promise<number> {
  const { count: pendientesCrear } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "crear").eq("estado", "pendiente");
  if ((pendientesCrear ?? 0) >= 5) return 0;

  // Fuente 1: mensajes entrantes de la tabla mensajes
  const { data: mensajes } = await db.from("mensajes")
    .select("contenido")
    .eq("direccion", "entrante")
    .gte("created_at", HACE_7_DIAS())
    .limit(30);

  // Fuente 2 (fallback): cuerpos de mensajes de la campaña GHL
  let textos: string[] = (mensajes ?? []).map((m: { contenido: string }) => m.contenido);
  if (textos.length < 5) {
    const { data: ghlMsgs } = await db.from("ghl_approval_queue")
      .select("cuerpo")
      .gte("created_at", HACE_7_DIAS())
      .not("cuerpo", "is", null)
      .limit(30);
    textos = [...textos, ...(ghlMsgs ?? []).map((m: { cuerpo: string }) => m.cuerpo ?? "")];
  }

  if (!textos.length) return 0;

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 400,
    messages: [{ role: "user", content:
      `Analiza estas preguntas/mensajes de leads sobre certificaciones CONOCER México.
Identifica máx ${MAX_POR_TIPO} temas recurrentes que probablemente NO están cubiertos en el KB.
Para cada uno, genera un draft de FAQ o Regla.
JSON: {"huecos": [{"tipo": "faq|regla", "titulo": "...", "contenido": "...", "razon": "..."}]}
Si todos los temas parecen cubiertos, responde: {"huecos": []}

Mensajes:
${textos.join("\n---\n")}` }],
  });
  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    huecos?: { tipo: string; titulo: string; contenido: string; razon: string }[]
  };

  let creados = 0;
  // Sin yaExistePendiente en el loop: el check de pendientesCrear < 5 al inicio
  // ya garantiza que no se inunda el panel. Cada hueco es único por título.
  for (const h of (json.huecos ?? []).slice(0, MAX_POR_TIPO)) {
    if (!h.titulo?.trim() || !h.contenido?.trim()) continue;
    await db.from("kbi_sugerencias").insert({
      recurso_id:          null,
      tipo_accion:         "crear",
      tipo_recurso_nuevo:  h.tipo === "regla" ? "regla" : "faq",
      titulo_propuesto:    h.titulo,
      contenido_propuesto: h.contenido,
      razon:               h.razon,
      origen:              "detector_huecos",
    });
    creados++;
  }
  return creados;
}

// ── Detector 5 — Patrón táctica/urgencia → regla_conversacional ──────
// Lee edits de GHL del admin y detecta si alguno aporta una táctica/urgencia
// que merece ser capturada como regla_conversacional.
// Complementa procesarUnEdit() que ya maneja KB (faq/regla).
async function detectarReglaDesdeEdits(db: DB): Promise<number> {
  const { data: edits } = await db.from("ghl_approval_queue")
    .select("mensaje_ia, mensaje_final, razon_edicion, contexto")
    .eq("estado", "editado")
    .eq("feedback_procesado", true)  // solo edits ya procesados por Detector 3
    .gte("revisado_at", HACE_7_DIAS())
    .not("mensaje_final", "is", null)
    .limit(15);

  if (!edits?.length) return 0;

  // Evitar crear duplicados: si ya hay >= 2 reglas conversacionales pendientes, omitir
  const { count: pendientes } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_recurso_nuevo", "regla_conversacional")
    .eq("estado", "pendiente");
  if ((pendientes ?? 0) >= 2) return 0;

  const ejemplos = (edits as { mensaje_ia: string | null; mensaje_final: string | null; razon_edicion: string | null }[])
    .slice(0, 5)
    .map((e, i) => `[${i+1}] IA: "${e.mensaje_ia?.slice(0, 120) ?? "—"}" → Admin: "${e.mensaje_final?.slice(0, 150) ?? "—"}"${e.razon_edicion ? ` (razón: "${e.razon_edicion.slice(0, 80)}")` : ""}`)
    .join("\n");

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 350,
    messages: [{ role: "user", content:
      `Analiza las siguientes correcciones de un admin a respuestas de IA de ventas para certificaciones CONOCER México.
Detecta si hay UN patrón que merezca ser una regla conversacional (táctica, urgencia, restricción o rebate de objeción).
Solo si hay un patrón claro. Si las correcciones son puntuales y sin patrón, responde: {}

Correcciones recientes:
${ejemplos}

JSON: {
  "tipo": "tactica|urgencia|restriccion|rebate",
  "nombre": "nombre corto de la regla",
  "instruccion": "instrucción en lenguaje natural para Claude (max 200 chars)",
  "razon": "por qué detectaste este patrón"
}` }],
  });

  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    tipo?: string; nombre?: string; instruccion?: string; razon?: string;
  };

  if (!json.nombre?.trim() || !json.instruccion?.trim()) return 0;
  const tiposValidos = ["tactica", "urgencia", "restriccion", "rebate"];
  if (!tiposValidos.includes(json.tipo ?? "")) return 0;

  await db.from("kbi_sugerencias").insert({
    recurso_id:          null,
    tipo_accion:         "crear",
    tipo_recurso_nuevo:  "regla_conversacional",
    titulo_propuesto:    json.nombre,
    contenido_propuesto: json.instruccion,
    razon:               json.razon ?? "Patrón detectado en edits del admin",
    origen:              "detector_patron",
    metadata:            { tipo: json.tipo, condiciones: {} },
  });
  return 1;
}

// ── Orquestador ───────────────────────────────────────────────────
export async function detectarSugerencias(): Promise<{ total: number; errores: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const errores: string[] = [];
  let total = 0;

  const detectores: [string, (db: DB) => Promise<number>][] = [
    ["baja_confianza",   detectarBajaConfianza],
    ["sin_uso",          detectarSinUso],
    ["patron_ghl",       detectarPatronGHL],
    ["huecos_cobertura", detectarHuecosCobertura],
    ["regla_desde_edits", detectarReglaDesdeEdits],
  ];

  for (const [nombre, fn] of detectores) {
    try {
      const n = await fn(db);
      total += n;
    } catch (e) {
      const msg = `${nombre}: ${e instanceof Error ? e.message : String(e)}`;
      errores.push(msg);
      void logSistema({
        categoria: "cron", tipoAccion: "kbi.detector", fase: "error", resultado: msg,
      });
    }
  }

  return { total, errores };
}

// ── Trigger inline (S75.3) ────────────────────────────────────────
// Llamado desde motor-respuesta cuando buscarRecursosKBI devuelve 0 resultados KB.
// Genera una sugerencia de tipo "crear" con un draft producido por la query del lead.
export async function crearSugerenciaHueco(query: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  // Máx 5 pendientes de tipo crear para no saturar
  const { count } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "crear").eq("estado", "pendiente")
    .eq("origen", "detector_huecos");
  if ((count ?? 0) >= 5) return;

  const res = await callClaudeIA("SUGERIR_KB", {
    max_tokens: 250,
    messages: [{ role: "user", content:
      `Crea un recurso FAQ o Regla para responder esta consulta de un lead de certificaciones CONOCER México.
Consulta sin cobertura en KB: "${query}"
JSON: {"tipo": "faq|regla", "titulo": "...", "contenido": "..."}
Si la consulta es demasiado específica o fuera de contexto, responde: {}` }],
  });
  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    tipo?: string; titulo?: string; contenido?: string
  };
  if (!json.titulo || !json.contenido) return;

  await db.from("kbi_sugerencias").insert({
    recurso_id:         null,
    tipo_accion:        "crear",
    tipo_recurso_nuevo: json.tipo === "regla" ? "regla" : "faq",
    titulo_propuesto:   json.titulo,
    contenido_propuesto: json.contenido,
    razon:              `Consulta del lead sin cobertura en KB: "${query.slice(0, 120)}"`,
    origen:             "detector_huecos",
  });
}
