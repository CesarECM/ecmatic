// MPS-30 S111.1-S111.2 — Detectores KBI de auditoría (6, 7, 8) migrados desde KB legado.
// Complementan detector.ts con diagnósticos de salud del corpus KB existente.
// Los detectores de este archivo operan sobre recursos_conocimiento ya aprobados y activos.

import { callClaudeIA } from "@/lib/ai/client";

const MAX_POR_TIPO = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

// Devuelve true si ya existe una sugerencia pendiente para el mismo recurso y acción.
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

// ── Detector 6 — Duplicados semánticos ───────────────────────────
// Usa la RPC buscar_duplicados_kb (pgvector, umbral 0.92) para encontrar pares casi idénticos.
// Sugiere desactivar el recurso con menor efectividad del par.
// Máx MAX_POR_TIPO sugerencias por ciclo para no saturar el panel.
export async function detectarDuplicadosSemanticos(db: DB): Promise<number> {
  const { count: pendientes } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "desactivar").eq("estado", "pendiente")
    .eq("origen", "detector_duplicados");
  if ((pendientes ?? 0) >= MAX_POR_TIPO) return 0;

  const { data: pares } = await db.rpc("buscar_duplicados_kb", { umbral: 0.92 });
  if (!pares?.length) return 0;

  const ids = [
    ...new Set((pares as { id_a: string; id_b: string }[]).flatMap(p => [p.id_a, p.id_b])),
  ];

  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido, score_efectividad, score_uso")
    .in("id", ids).eq("activo", true).eq("aprobado", true);

  if (!recursos?.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaR = Object.fromEntries((recursos as any[]).map(r => [r.id, r]));
  let creados = 0;

  for (const par of (pares as { id_a: string; id_b: string; similitud: number }[])) {
    if (creados >= MAX_POR_TIPO) break;
    const a = mapaR[par.id_a], b = mapaR[par.id_b];
    if (!a || !b) continue;

    // Conservar el de mayor efectividad; sugerir desactivar el otro
    const [mejor, peor] = (a.score_efectividad ?? 0) >= (b.score_efectividad ?? 0) ? [a, b] : [b, a];
    if (await yaExistePendiente(db, peor.id, "desactivar")) continue;

    await db.from("kbi_sugerencias").insert({
      recurso_id:          peor.id,
      tipo_accion:         "desactivar",
      titulo_propuesto:    peor.titulo,
      contenido_propuesto: peor.contenido,
      razon: `Duplicado semántico: ${Math.round(par.similitud * 100)}% similitud con "${mejor.titulo}". Conservar el de mayor efectividad (${Math.round((mejor.score_efectividad ?? 0) * 100)}% vs ${Math.round((peor.score_efectividad ?? 0) * 100)}%).`,
      origen:              "detector_duplicados",
    });
    creados++;
  }
  return creados;
}

// ── Detector 7 — Obsolescencia parcial ───────────────────────────
// Detecta recursos sin actualizar en 90+ días que probablemente tienen datos puntuales
// desactualizados (precios, fechas, requisitos). Claude (Haiku) filtra los casos reales.
export async function detectarObsolescenciaParcial(db: DB): Promise<number> {
  const { count: pendientes } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "actualizar").eq("estado", "pendiente")
    .eq("origen", "detector_obsolescencia");
  if ((pendientes ?? 0) >= MAX_POR_TIPO) return 0;

  const NOVENTA_DIAS = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { data: candidatos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .eq("activo", true).eq("aprobado", true)
    .lt("updated_at", NOVENTA_DIAS)
    .in("tipo", ["faq", "servicio", "objecion"])
    .order("updated_at", { ascending: true })
    .limit(10);

  if (!candidatos?.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textos = (candidatos as any[])
    .map(r => `[${r.id}] ${r.titulo}: ${(r.contenido as string).slice(0, 200)}`)
    .join("\n---\n");

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 300,
    messages: [{ role: "user", content:
      `Analiza estos recursos KB de un centro de certificaciones CONOCER México.
Identifica cuáles contienen datos puntuales que pueden haberse desactualizado: precios, fechas, plazos, requisitos específicos o nombres de procesos.
Lista solo los IDs afectados: {"ids_obsoletos": ["uuid1"]}
Si ninguno parece desactualizado, responde: {"ids_obsoletos": []}

Recursos:
${textos}` }],
  });
  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { ids_obsoletos?: string[] };

  let creados = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaCandidatos = Object.fromEntries((candidatos as any[]).map(r => [r.id, r]));

  for (const id of (json.ids_obsoletos ?? []).slice(0, MAX_POR_TIPO)) {
    const recurso = mapaCandidatos[id];
    if (!recurso) continue;
    if (await yaExistePendiente(db, id, "actualizar")) continue;

    await db.from("kbi_sugerencias").insert({
      recurso_id:          id,
      tipo_accion:         "actualizar",
      titulo_propuesto:    recurso.titulo,
      contenido_propuesto: recurso.contenido,
      razon:               `Sin actualizar en 90+ días. Posibles datos desactualizados: precios, fechas o requisitos. Revisar y actualizar antes de que afecte respuestas al lead.`,
      origen:              "detector_obsolescencia",
    });
    creados++;
  }
  return creados;
}

// ── Detector 8 — Canibalización ───────────────────────────────────
// Encuentra pares con similitud ≥ 0.85 donde la diferencia de efectividad es ≥ 20 puntos.
// Sugiere desactivar el recurso menos efectivo del par para reducir ruido en búsqueda.
export async function detectarCanibalizacion(db: DB): Promise<number> {
  const { count: pendientes } = await db.from("kbi_sugerencias")
    .select("id", { count: "exact", head: true })
    .eq("tipo_accion", "desactivar").eq("estado", "pendiente")
    .eq("origen", "detector_canibalizacion");
  if ((pendientes ?? 0) >= MAX_POR_TIPO) return 0;

  const { data: pares } = await db.rpc("buscar_duplicados_kb", { umbral: 0.85 });
  if (!pares?.length) return 0;

  const ids = [
    ...new Set((pares as { id_a: string; id_b: string }[]).flatMap(p => [p.id_a, p.id_b])),
  ];

  const { data: recursos } = await db.from("recursos_conocimiento")
    .select("id, titulo, contenido, score_efectividad, score_uso")
    .in("id", ids).eq("activo", true).eq("aprobado", true);

  if (!recursos?.length) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaR = Object.fromEntries((recursos as any[]).map(r => [r.id, r]));
  let creados = 0;

  for (const par of (pares as { id_a: string; id_b: string; similitud: number }[])) {
    if (creados >= MAX_POR_TIPO) break;
    const a = mapaR[par.id_a], b = mapaR[par.id_b];
    if (!a || !b) continue;

    const [mejor, peor] = (a.score_efectividad ?? 0) >= (b.score_efectividad ?? 0) ? [a, b] : [b, a];
    const diferencia = (mejor.score_efectividad ?? 0) - (peor.score_efectividad ?? 0);

    // Solo actuar si la diferencia de efectividad supera el umbral del 20%
    if (diferencia < 0.20) continue;
    if (await yaExistePendiente(db, peor.id, "desactivar")) continue;

    await db.from("kbi_sugerencias").insert({
      recurso_id:          peor.id,
      tipo_accion:         "desactivar",
      titulo_propuesto:    peor.titulo,
      contenido_propuesto: peor.contenido,
      razon: `Canibalización: "${mejor.titulo}" cubre el mismo tema con ${Math.round((mejor.score_efectividad ?? 0) * 100)}% de efectividad vs ${Math.round((peor.score_efectividad ?? 0) * 100)}% de este recurso. Desactivar el menos efectivo reduce ruido en búsqueda.`,
      origen:              "detector_canibalizacion",
    });
    creados++;
  }
  return creados;
}

// ── Urgencia: patrón de ediciones repetidas ───────────────────────
// Llamado desde procesarUnEdit() del Detector 3 en detector.ts.
// Si el mismo recurso acumula 3+ edits en los últimos 7 días, marca la sugerencia como urgente
// usando origen='detector_urgente' para que la UI pueda destacarla.
const UMBRAL_URGENCIA = 3;
const VENTANA_URGENCIA_DIAS = 7;

export async function verificarUrgenciaPatron(db: DB, recursoIds: string[]): Promise<string> {
  if (!recursoIds.length) return "detector_patron";

  const ventana = new Date(Date.now() - VENTANA_URGENCIA_DIAS * 86_400_000).toISOString();

  for (const recursoId of recursoIds) {
    const { count } = await db.from("ghl_approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("estado", "editado")
      .eq("feedback_procesado", true)
      .gte("revisado_at", ventana)
      .filter("contexto->recursosIds", "cs", JSON.stringify([recursoId])) as { count: number | null };

    if ((count ?? 0) >= UMBRAL_URGENCIA - 1) return "detector_urgente";
  }
  return "detector_patron";
}
