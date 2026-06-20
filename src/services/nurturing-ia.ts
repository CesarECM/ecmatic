// S20.7 — Orquestador de propuestas de ajuste para nurturing.
// Calcula métricas de rendimiento por secuencia y solicita ajustes a la IA.
// Los ajustes aprobados se insertan en sugerencias_ia para revisión del admin.

import { createServiceClient } from "@/lib/supabase/service";
import { listarSecuencias } from "@/services/nurturing";
import { analizarRendimientoNurturing, type MetricaSecuencia } from "@/lib/ai/nurturing-ia";

const VENTANA_ANALISIS_DIAS = 30;  // período de análisis
const MIN_ENVIOS_PARA_ANALISIS = 3; // secuencias con menos envíos se omiten

export interface ResultadoAjustesNurturing {
  secuenciasAnalizadas: number;
  ajustesSugeridos:     number;
  ajustesInsertados:    number;
}

// ── Métricas ──────────────────────────────────────────────────────────────

async function calcularMetricas(): Promise<MetricaSecuencia[]> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - VENTANA_ANALISIS_DIAS * 86_400_000).toISOString();

  const [secuencias, { data: envios }] = await Promise.all([
    listarSecuencias(true),
    (supabase as any)
      .from("nurturing_envios")
      .select("secuencia_id, lead_id, estado, created_at")
      .gte("created_at", desde)
      .eq("estado", "enviado"),
  ]);

  if (!secuencias.length || !envios?.length) return [];

  // Agrupar envíos por secuencia
  const envioPorSec = new Map<string, { lead_id: string; created_at: string }[]>();
  for (const e of envios as { secuencia_id: string; lead_id: string; created_at: string }[]) {
    const arr = envioPorSec.get(e.secuencia_id) ?? [];
    arr.push(e);
    envioPorSec.set(e.secuencia_id, arr);
  }

  // Detectar respuestas (mensaje entrante del lead en las 48h post-envío)
  const leadIds = [...new Set((envios as { lead_id: string }[]).map((e) => e.lead_id))];
  const { data: respuestas } = await (supabase as any)
    .from("mensajes")
    .select("lead_id, created_at")
    .in("lead_id", leadIds)
    .eq("direccion", "entrante")
    .gte("created_at", desde);

  const respuestasPorLead = new Map<string, Date[]>();
  for (const r of respuestas ?? []) {
    const arr = respuestasPorLead.get(r.lead_id) ?? [];
    arr.push(new Date(r.created_at));
    respuestasPorLead.set(r.lead_id, arr);
  }

  const metricas: MetricaSecuencia[] = [];

  for (const sec of secuencias) {
    const enviados = envioPorSec.get(sec.id) ?? [];
    if (enviados.length < MIN_ENVIOS_PARA_ANALISIS) continue;

    let respondidos = 0;
    for (const e of enviados) {
      const fechaEnvio = new Date(e.created_at);
      const limite48h = new Date(fechaEnvio.getTime() + 48 * 3_600_000);
      const respuestasLead = respuestasPorLead.get(e.lead_id) ?? [];
      if (respuestasLead.some((r) => r > fechaEnvio && r < limite48h)) respondidos++;
    }

    metricas.push({
      id:                 sec.id,
      nombre:             sec.nombre,
      canal:              sec.canal,
      etapa_pipeline:     sec.etapa_pipeline,
      fase_cagc_min:      sec.fase_cagc_min,
      fase_cagc_max:      sec.fase_cagc_max,
      dias_sin_respuesta: sec.dias_sin_respuesta,
      total_enviados:     enviados.length,
      respondidos,
      tasa_respuesta:     enviados.length > 0 ? respondidos / enviados.length : 0,
    });
  }

  return metricas;
}

// ── Punto de entrada público ──────────────────────────────────────────────

export async function proponerAjustesNurturing(): Promise<ResultadoAjustesNurturing> {
  const supabase = createServiceClient();

  const metricas = await calcularMetricas();
  if (!metricas.length) {
    return { secuenciasAnalizadas: 0, ajustesSugeridos: 0, ajustesInsertados: 0 };
  }

  const ajustes = await analizarRendimientoNurturing(metricas);
  if (!ajustes.length) {
    return { secuenciasAnalizadas: metricas.length, ajustesSugeridos: 0, ajustesInsertados: 0 };
  }

  // Deduplicar contra sugerencias nurturing pendientes
  const { data: pendientes } = await (supabase as any)
    .from("sugerencias_ia")
    .select("titulo")
    .eq("tipo", "general")
    .is("aprobado", null);

  const titulosPendientes = new Set(
    (pendientes ?? []).map((s: { titulo: string }) => s.titulo.toLowerCase())
  );

  let insertados = 0;
  for (const ajuste of ajustes) {
    const titulo = `Nurturing: ${ajuste.tipo_ajuste} — ${ajuste.secuencia_nombre}`;
    if (titulosPendientes.has(titulo.toLowerCase())) continue;

    await (supabase as any).from("sugerencias_ia").insert({
      tipo:        "general",
      titulo,
      descripcion: ajuste.descripcion,
      prioridad:   ajuste.prioridad,
      metadata:    {
        categoria:       "nurturing_ajuste",
        secuencia_id:    ajuste.secuencia_id,
        tipo_ajuste:     ajuste.tipo_ajuste,
      } satisfies Record<string, unknown>,
    });
    insertados++;
  }

  return {
    secuenciasAnalizadas: metricas.length,
    ajustesSugeridos:     ajustes.length,
    ajustesInsertados:    insertados,
  };
}
