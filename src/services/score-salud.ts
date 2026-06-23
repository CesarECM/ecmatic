// ES-1 + S30.1 — Score de Salud de Venta por lead
// Implementa un modelo de features ponderadas calibrables con histórico real,
// inspirado en el espíritu de Gradient Boosting pero viable en TypeScript puro.
// Escribe directamente en leads.score_salud (campo que estaba estático en DEFAULT 50).

import { createServiceClient } from "@/lib/supabase/service";

// ── Pesos por feature (calibrables con histórico) ─────────────────────────
// Cada peso indica cuántos puntos aporta o resta la feature al score (0–100).
// Los pesos iniciales están calibrados con conocimiento del dominio de ventas
// CONOCER; se re-calibran automáticamente cada semana con calcularPesosOptimos().
interface Pesos {
  w_etapa:      number; // valor de etapa de pipeline (0-100 normalizado)
  w_inactividad: number; // penalización por días sin actividad (negativo)
  w_mensajes:   number; // engagement por cantidad de mensajes
  w_cagc:       number; // posición CAGC (0-16 normalizado)
  w_email:      number; // bonus por tener email capturado
  w_canal:      number; // bonus por canal de alta intención
}

const PESOS_BASE: Pesos = {
  w_etapa:       0.35,
  w_inactividad: -0.30,
  w_mensajes:    0.15,
  w_cagc:        0.12,
  w_email:       0.05,
  w_canal:       0.03,
};

const ORDEN_ETAPAS: Record<string, number> = {
  "Nuevo": 0, "Contactado": 1, "Primer contacto": 1,
  "Interesado": 2, "Diagnóstico": 2,
  "Propuesta": 3, "Seguimiento": 3,
  "Negociación": 4, "Decisión": 4,
  "Comprado": 5, "Certificado": 6,
  "Perdido": -1,
};

const CANALES_ALTA_INTENCION = new Set(["whatsapp", "ghl"]);

// ── Feature extraction ─────────────────────────────────────────────────────
async function extraerFeatures(leadId: string, supabase: ReturnType<typeof createServiceClient>): Promise<{
  etapaNorm:      number; // 0-1
  inactividadNorm: number; // 0-1 (mayor = más inactivo)
  mensajesNorm:   number; // 0-1 (cap en 50 mensajes)
  cagcNorm:       number; // 0-1
  tieneEmail:     boolean;
  canalAltoIntento: boolean;
} | null> {
  const { data: lead } = await supabase
    .from("leads")
    .select("pipeline_stage, canal_origen, email, updated_at")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  // Etapa normalizada (Perdido → 0)
  const ordenEtapa = ORDEN_ETAPAS[lead.pipeline_stage ?? "Nuevo"] ?? 0;
  const etapaNorm = Math.max(0, ordenEtapa) / 6;

  // Días de inactividad (últimos 90 días como tope)
  const dias = (Date.now() - new Date(lead.updated_at).getTime()) / 86_400_000;
  const inactividadNorm = Math.min(dias / 90, 1);

  // Mensajes (cap en 50)
  const { count: totalMensajes } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);
  const mensajesNorm = Math.min((totalMensajes ?? 0) / 50, 1);

  // Fase CAGC
  const { data: cagcEstado } = await supabase
    .from("lead_cagc_estado")
    .select("fase_numero")
    .eq("lead_id", leadId)
    .maybeSingle();
  const cagcNorm = ((cagcEstado?.fase_numero ?? 0) / 16);

  return {
    etapaNorm,
    inactividadNorm,
    mensajesNorm,
    cagcNorm,
    tieneEmail: !!lead.email,
    canalAltoIntento: CANALES_ALTA_INTENCION.has(lead.canal_origen ?? ""),
  };
}

// ── Cálculo del score ──────────────────────────────────────────────────────
function calcularScore(
  f: NonNullable<Awaited<ReturnType<typeof extraerFeatures>>>,
  pesos: Pesos
): number {
  const raw =
    f.etapaNorm       * pesos.w_etapa +
    (1 - f.inactividadNorm) * Math.abs(pesos.w_inactividad) + // más activo → más puntos
    f.mensajesNorm    * pesos.w_mensajes +
    f.cagcNorm        * pesos.w_cagc +
    (f.tieneEmail      ? pesos.w_email  : 0) +
    (f.canalAltoIntento ? pesos.w_canal : 0);

  // Normalizar a 0-100 (la suma de pesos abs ~ 1.0 → raw ya está en 0-1)
  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}

// ── API pública ────────────────────────────────────────────────────────────

// ES-1 / S30.1 — Calcula y persiste el score de salud de un lead.
// Llamar fire-and-forget desde conversacion.ts.
export async function actualizarScoreSalud(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const pesos = await obtenerPesosVigentes(supabase);
  const features = await extraerFeatures(leadId, supabase);
  if (!features) return;

  const score = calcularScore(features, pesos);

  // S35.5 — Agregar entrada al historial (cap: últimas 90 entradas)
  const { data: leadActual } = await supabase
    .from("leads").select("score_salud_historial").eq("id", leadId).maybeSingle();
  const historial: { score: number; timestamp: string }[] =
    (leadActual as { score_salud_historial?: unknown })?.score_salud_historial as { score: number; timestamp: string }[] ?? [];
  historial.push({ score, timestamp: new Date().toISOString() });
  const historialCap = historial.slice(-90);

  await supabase
    .from("leads")
    .update({ score_salud: score, score_salud_historial: historialCap })
    .eq("id", leadId);
}

// S30.1 — Recalcula scores de todos los leads activos (para el cron semanal).
export async function recalcularTodosLosScores(): Promise<{ actualizados: number }> {
  const supabase = createServiceClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("activo", true);

  if (!leads?.length) return { actualizados: 0 };
  const pesos = await obtenerPesosVigentes(supabase);

  for (const { id } of leads) {
    const features = await extraerFeatures(id, supabase);
    if (!features) continue;
    const score = calcularScore(features, pesos);
    await supabase.from("leads").update({ score_salud: score }).eq("id", id);
  }
  return { actualizados: leads.length };
}

// S30.1 — Calibra los pesos usando historial de conversión (gradient descent simplificado).
// Un lead que llegó a "Comprado" es label=1; "Perdido" es label=0.
// Actualiza los pesos en configuracion_sistema.metadata["pesos_score_salud"].
export async function calibrarPesos(): Promise<Pesos> {
  const supabase = createServiceClient();

  const { data: leadsCerrados } = await supabase
    .from("leads")
    .select("id, pipeline_stage, canal_origen, email, updated_at")
    .in("pipeline_stage", ["Comprado", "Certificado", "Perdido"])
    .eq("activo", false);

  if (!leadsCerrados || leadsCerrados.length < 20) {
    // Datos insuficientes para calibrar — mantener pesos base
    return PESOS_BASE;
  }

  const TASA_APRENDIZAJE = 0.05;
  let pesos = { ...PESOS_BASE };

  for (const lead of leadsCerrados) {
    const features = await extraerFeatures(lead.id, supabase);
    if (!features) continue;

    const label = ["Comprado", "Certificado"].includes(lead.pipeline_stage) ? 1 : 0;
    const prediccion = calcularScore(features, pesos) / 100; // 0-1
    const error = label - prediccion;

    // Gradient descent: w += lr * error * feature
    pesos.w_etapa       += TASA_APRENDIZAJE * error * features.etapaNorm;
    pesos.w_inactividad += TASA_APRENDIZAJE * error * (1 - features.inactividadNorm);
    pesos.w_mensajes    += TASA_APRENDIZAJE * error * features.mensajesNorm;
    pesos.w_cagc        += TASA_APRENDIZAJE * error * features.cagcNorm;
    pesos.w_email       += TASA_APRENDIZAJE * error * (features.tieneEmail ? 1 : 0);
    pesos.w_canal       += TASA_APRENDIZAJE * error * (features.canalAltoIntento ? 1 : 0);
  }

  // Normalizar para que sumen ~1.0
  const sumaAbs = Object.values(pesos).reduce((s, v) => s + Math.abs(v), 0);
  if (sumaAbs > 0) {
    for (const k of Object.keys(pesos) as (keyof Pesos)[]) {
      pesos[k] = pesos[k] / sumaAbs;
    }
  }

  // Persistir en configuracion_sistema
  const { data: config } = await supabase
    .from("configuracion_sistema").select("id, metadata").limit(1).single();
  if (config) {
    const meta = (config.metadata ?? {}) as Record<string, unknown>;
    await supabase.from("configuracion_sistema")
      .update({ metadata: { ...meta, pesos_score_salud: pesos } })
      .eq("id", config.id);
  }
  return pesos;
}

// Lee los pesos calibrados de BD o devuelve los base si no existen.
async function obtenerPesosVigentes(
  supabase: ReturnType<typeof createServiceClient>
): Promise<Pesos> {
  const { data: config } = await supabase
    .from("configuracion_sistema").select("metadata").limit(1).maybeSingle();
  const meta = (config?.metadata ?? {}) as Record<string, unknown>;
  return (meta.pesos_score_salud as Pesos) ?? PESOS_BASE;
}
