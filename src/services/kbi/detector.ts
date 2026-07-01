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
// Recursos que se usan mucho (≥10 señales) pero rara vez conducen a conversión (<20%).
// Acción sugerida: actualizar el contenido para que sea más persuasivo o correcto.
async function detectarBajaConfianza(db: DB): Promise<number> {
  const { data: agregados } = await db.rpc("kbi_agregar_senales");
  if (!agregados?.length) return 0;

  const candidatos = (agregados as { recurso_id: string; total_usos: number; total_cierres: number }[])
    .filter(a => a.total_usos >= 10 && a.total_cierres / a.total_usos < 0.20)
    .slice(0, MAX_POR_TIPO);
  if (!candidatos.length) return 0;

  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .in("id", candidatos.map(c => c.recurso_id))
    .in("tipo", ["faq", "regla"])
    .eq("activo", true).eq("aprobado", true);

  let creados = 0;
  for (const r of (recursos ?? [])) {
    if (await yaExistePendiente(db, r.id, "actualizar")) continue;
    const agg = candidatos.find(c => c.recurso_id === r.id)!;
    const pct = Math.round((agg.total_cierres / agg.total_usos) * 100);
    await db.from("kbi_sugerencias").insert({
      recurso_id:          r.id,
      tipo_accion:         "actualizar",
      titulo_propuesto:    r.titulo,
      contenido_propuesto: r.contenido,
      razon: `Baja efectividad: ${agg.total_cierres} cierres de ${agg.total_usos} usos (${pct}%). ` +
             `Revisar si el contenido responde la pregunta del lead con suficiente claridad y persuasión.`,
      origen: "detector_confianza",
    });
    creados++;
  }
  return creados;
}

// ── Detector 2 — Sin uso ──────────────────────────────────────────
// Recursos faq/regla que llevan 30+ días sin recibir ninguna señal de uso.
// Acción sugerida: desactivar para limpiar el KB y mejorar la precisión de búsqueda.
async function detectarSinUso(db: DB): Promise<number> {
  const { data: idsConUsoRaw } = await db.from("kbi_senales")
    .select("recurso_id").eq("tipo_senal", "uso");
  const idsConUso = new Set<string>((idsConUsoRaw ?? []).map((r: { recurso_id: string }) => r.recurso_id));

  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .in("tipo", ["faq", "regla"])
    .eq("activo", true).eq("aprobado", true)
    .lt("created_at", HACE_30_DIAS())
    .limit(20);

  const sinUso = (recursos ?? []).filter((r: { id: string }) => !idsConUso.has(r.id));
  let creados = 0;

  for (const r of sinUso.slice(0, MAX_POR_TIPO)) {
    if (await yaExistePendiente(db, r.id, "desactivar")) continue;
    await db.from("kbi_sugerencias").insert({
      recurso_id:          r.id,
      tipo_accion:         "desactivar",
      titulo_propuesto:    r.titulo,
      contenido_propuesto: r.contenido,
      razon: `Sin ningún uso registrado en 30+ días desde su creación. ` +
             `Considera si este recurso sigue siendo relevante para el catálogo actual.`,
      origen: "detector_confianza",
    });
    creados++;
  }
  return creados;
}

// ── Detector 3 — Patrón de edición GHL ───────────────────────────
// Recursos KB que el admin editó 2+ veces en la última semana en la campaña GHL.
// Acción sugerida: actualizar el recurso de raíz para que la IA no repita el error.
async function detectarPatronGHL(db: DB): Promise<number> {
  const { data: edits } = await db.from("ghl_approval_queue")
    .select("razon_edicion, contexto")
    .eq("estado", "editado")
    .eq("feedback_procesado", true)
    .gte("revisado_at", HACE_7_DIAS())
    .limit(50);

  if (!edits?.length) return 0;

  // Agrupar razones de edición por recurso KB
  const mapaRecurso = new Map<string, string[]>();
  for (const e of edits) {
    const ids: string[] = (e.contexto?.recursosIds as string[] | undefined) ?? [];
    for (const rid of ids) {
      if (e.razon_edicion) {
        mapaRecurso.set(rid, [...(mapaRecurso.get(rid) ?? []), e.razon_edicion]);
      }
    }
  }

  // Solo recursos con 2+ edits
  const conProblemas = [...mapaRecurso.entries()]
    .filter(([, razones]) => razones.length >= 2)
    .slice(0, MAX_POR_TIPO);
  if (!conProblemas.length) return 0;

  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .in("id", conProblemas.map(([id]) => id))
    .in("tipo", ["faq", "regla"]);

  const mapaRecursos = Object.fromEntries(
    (recursos ?? []).map((r: { id: string; titulo: string; contenido: string }) => [r.id, r])
  );

  let creados = 0;
  for (const [id, razones] of conProblemas) {
    const r = mapaRecursos[id];
    if (!r || await yaExistePendiente(db, id, "actualizar")) continue;

    // Haiku detecta qué cambiar específicamente
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 200,
      messages: [{ role: "user", content:
        `Eres editor de KB de un centro de certificaciones CONOCER México.
Un recurso fue editado manualmente ${razones.length} veces esta semana con estas razones:
${razones.slice(0, 3).join(" / ")}

Recurso actual: "${r.titulo}": ${r.contenido.slice(0, 200)}

Propón una versión mejorada del contenido que corrija el problema recurrente.
JSON: {"contenido_nuevo": "..."}` }],
    });
    const raw  = (res.content[0] as { text: string }).text;
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { contenido_nuevo?: string };

    await db.from("kbi_sugerencias").insert({
      recurso_id:          id,
      tipo_accion:         "actualizar",
      titulo_propuesto:    r.titulo,
      contenido_propuesto: json.contenido_nuevo ?? r.contenido,
      razon: `Editado ${razones.length}x en 7 días: "${razones.slice(0, 2).join(" / ")}"`,
      origen: "detector_patron",
    });
    creados++;
  }
  return creados;
}

// ── Detector 4 — Huecos de cobertura ─────────────────────────────
// Analiza mensajes entrantes recientes para encontrar temas sin recurso KB.
// Acción sugerida: crear un nuevo faq o regla con un draft generado por Haiku.
async function detectarHuecosCobertura(db: DB): Promise<number> {
  // No crear más si ya hay 5+ sugerencias "crear" pendientes (evitar flood)
  const { count: pendientesCrear } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "crear").eq("estado", "pendiente");
  if ((pendientesCrear ?? 0) >= 5) return 0;

  const { data: mensajes } = await db.from("mensajes")
    .select("contenido")
    .eq("direccion", "entrante")
    .gte("created_at", HACE_7_DIAS())
    .limit(30);

  if (!mensajes?.length) return 0;

  const preguntas = (mensajes as { contenido: string }[]).map(m => m.contenido).join("\n");

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 300,
    messages: [{ role: "user", content:
      `Analiza estas preguntas de leads sobre certificaciones CONOCER México.
Identifica máx ${MAX_POR_TIPO} temas recurrentes que probablemente no están cubiertos en el KB.
Para cada uno, genera un draft de FAQ o Regla.
JSON: {"huecos": [{"tipo": "faq|regla", "titulo": "...", "contenido": "...", "razon": "..."}]}

Preguntas:
${preguntas}` }],
  });
  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    huecos?: { tipo: string; titulo: string; contenido: string; razon: string }[]
  };

  let creados = 0;
  for (const h of (json.huecos ?? []).slice(0, MAX_POR_TIPO)) {
    if (!h.titulo || !h.contenido) continue;
    if (await yaExistePendiente(db, null, "crear")) continue;
    await db.from("kbi_sugerencias").insert({
      recurso_id:         null,
      tipo_accion:        "crear",
      tipo_recurso_nuevo: h.tipo === "regla" ? "regla" : "faq",
      titulo_propuesto:   h.titulo,
      contenido_propuesto: h.contenido,
      razon:              h.razon,
      origen:             "detector_huecos",
    });
    creados++;
  }
  return creados;
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
