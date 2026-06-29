import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import {
  calcularTrustScore, updateDecisionsWindow, parametrosDesdeScore,
  UMBRAL_AUTO_FIJO, TRUST_NIVEL4,
} from "@/lib/ghl/trust-score";

export interface ItemAprobacionGHL {
  id: string;
  campana: string;
  ghl_contact_id: string;
  conv_id: string;
  lead_ecmatic_id: string | null;
  nombre: string | null;
  mensaje_lead: string;
  mensaje_ia: string;
  mensaje_final: string | null;
  razon_edicion: string | null;
  contexto: Record<string, unknown> | null;
  estado: "pendiente" | "aprobado" | "editado" | "rechazado";
  score_ia: number | null;
  razon_score: string | null;
  conteo_notificaciones: number;
  ultima_notificacion_at: string | null;
  created_at: string;
  revisado_at: string | null;
  enviado_at: string | null;
}

export interface StatsAprobacionGHL {
  campana_key: string;
  total: number;
  aprobados: number;
  editados: number;
  rechazados: number;
  tasa_limpia: number;
  aprobados_consecutivos: number;  // legacy — ya no controla el nivel
  automatizado: boolean;
  activa: boolean;
  umbral_auto: number;             // fijo en UMBRAL_AUTO_FIJO (0.92)
  pagina_campana: number;
  ultimo_lote_at: string | null;
  ultima_notif_pausa_at: string | null;
  // MPS-6 — Trust Score Bayesiano
  decisions_window: number[];      // últimas N decisiones (1=aprobado, 0=editado, -1=phantom)
  trust_score: number;             // Wilson lower bound de Beta sobre decisions_window
  window_size: number;             // tamaño máximo de decisions_window (default 20)
  last_decision_at: string | null; // timestamp de la última decisión humana (para decay)
  last_phantom_at: string | null;  // timestamp de la última inyección de phantom (anti-doble)
}

export interface NivelCampana {
  nivel: 0 | 1 | 2 | 3 | 4;
  tamanoLote: number;
  intervaloMin: number;
  umbral: number;
  descripcion: string;
}

// MPS-6: nivel y parámetros de velocidad se derivan del trust_score bayesiano.
// umbral_auto es fijo (UMBRAL_AUTO_FIJO = 0.92) — no varía con el nivel.
export function calcularNivel(
  stats: Pick<StatsAprobacionGHL, "trust_score" | "automatizado">,
): NivelCampana {
  return parametrosDesdeScore(stats.trust_score, stats.automatizado);
}

// Inserta un mensaje en la cola de aprobación
export async function encolarMensajeGHL(params: {
  campana: string;
  ghlContactId: string;
  convId: string;
  leadEcmaticId?: string;
  nombre?: string | null;
  mensajeLead: string;
  mensajeIA: string;
  contexto?: Record<string, unknown>;
  scoreIA?: number;
  razonScore?: string;
  seguimientoId?: string | null;  // MPS-5: para avanzarNivel al aprobar
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("ghl_approval_queue")
    .insert({
      campana:          params.campana,
      ghl_contact_id:   params.ghlContactId,
      conv_id:          params.convId,
      lead_ecmatic_id:  params.leadEcmaticId ?? null,
      nombre:           params.nombre ?? null,
      mensaje_lead:     params.mensajeLead,
      mensaje_ia:       params.mensajeIA,
      contexto:         params.contexto ?? null,
      score_ia:         params.scoreIA ?? null,
      razon_score:      params.razonScore ?? null,
      seguimiento_id:   params.seguimientoId ?? null,
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (error) {
    void logSistema({
      categoria: "ia", tipoAccion: "ghl_aprobacion.encolar", fase: "error",
      resultado: String(error),
      metadata: { ghlContactId: params.ghlContactId },
    });
    return null;
  }
  return data?.id ?? null;
}

// Obtiene stats de automatización para la campaña
export async function obtenerStatsAprobacion(campana: string): Promise<StatsAprobacionGHL | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("ghl_approval_stats")
    .select("*")
    .eq("campana_key", campana)
    .maybeSingle() as { data: StatsAprobacionGHL | null };
  return data;
}

// ¿La campaña está en modo automático?
export async function esModoAutomatico(campana: string): Promise<boolean> {
  const stats = await obtenerStatsAprobacion(campana);
  return stats?.automatizado ?? false;
}

// Lista pendientes para el panel /admin/aprobaciones
export async function listarPendientesGHL(campana?: string): Promise<ItemAprobacionGHL[]> {
  const supabase = createServiceClient();
  let q = (supabase as any)
    .from("ghl_approval_queue")
    .select("*")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (campana) q = q.eq("campana", campana);

  const { data } = await q as { data: ItemAprobacionGHL[] | null };
  return data ?? [];
}

// Obtiene el item pendiente de un lead específico (para banner en ficha lead)
export async function obtenerPendienteGHLParaLead(
  leadEcmaticId: string
): Promise<ItemAprobacionGHL | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("*")
    .eq("lead_ecmatic_id", leadEcmaticId)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: ItemAprobacionGHL | null };
  return data;
}

// Actualiza estado y registra la decisión
export async function resolverItemAprobacion(params: {
  id: string;
  estado: "aprobado" | "editado" | "rechazado";
  mensajeFinal?: string;
  razonEdicion?: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_approval_queue")
    .update({
      estado:         params.estado,
      mensaje_final:  params.mensajeFinal ?? null,
      razon_edicion:  params.razonEdicion ?? null,
      revisado_at:    new Date().toISOString(),
      ...(params.estado !== "rechazado" && { enviado_at: new Date().toISOString() }),
    })
    .eq("id", params.id);
}

// Actualiza contadores globales de la campaña.
// MPS-6: actualiza la ventana bayesiana y recalcula trust_score.
// Los contadores históricos (total, aprobados, editados, rechazados) se mantienen para analítica.
// aprobados_consecutivos se preserva como dato legacy pero ya no controla el nivel.
export async function actualizarStatsAprobacion(
  campana: string,
  decision: "aprobado" | "editado" | "rechazado"
): Promise<void> {
  const supabase = createServiceClient();
  const stats = await obtenerStatsAprobacion(campana);
  if (!stats) return;

  // Contadores históricos (analítica)
  const contadores = {
    total:                  stats.total + 1,
    aprobados:              stats.aprobados  + (decision === "aprobado"  ? 1 : 0),
    editados:               stats.editados   + (decision === "editado"   ? 1 : 0),
    rechazados:             stats.rechazados + (decision === "rechazado" ? 1 : 0),
    aprobados_consecutivos: decision === "aprobado" ? (stats.aprobados_consecutivos ?? 0) + 1
                          : decision === "editado"  ? 0
                          : (stats.aprobados_consecutivos ?? 0),
    updated_at:             new Date().toISOString(),
  };

  // Ventana bayesiana (rechazados no entran)
  const windowActual  = Array.isArray(stats.decisions_window) ? stats.decisions_window : [];
  const windowSize    = stats.window_size ?? 20;
  const nuevaVentana  = updateDecisionsWindow(windowActual, decision, windowSize);
  const nuevoScore    = calcularTrustScore(nuevaVentana);

  // Auto-activación nivel 4: trust_score alto + ventana llena
  const debeAutomatizar =
    !stats.automatizado &&
    nuevoScore >= TRUST_NIVEL4 &&
    nuevaVentana.length >= windowSize;

  const ahora = new Date().toISOString();

  await (supabase as any)
    .from("ghl_approval_stats")
    .update({
      ...contadores,
      decisions_window: nuevaVentana,
      trust_score:      nuevoScore,
      umbral_auto:      UMBRAL_AUTO_FIJO,
      ...(decision !== "rechazado" && { last_decision_at: ahora }),
      ...(debeAutomatizar          && { automatizado: true }),
    })
    .eq("campana_key", campana);
}

// Toggle ON/OFF de la campaña
export async function activarCampana(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("ghl_approval_stats").update({ activa: true }).eq("campana_key", campana);
}

export async function desactivarCampana(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("ghl_approval_stats").update({ activa: false }).eq("campana_key", campana);
}

// MPS-6: umbral_auto es fijo (UMBRAL_AUTO_FIJO). Se conserva la función por compatibilidad.
export async function obtenerUmbralAuto(_campana: string): Promise<number> {
  return UMBRAL_AUTO_FIJO;
}

// Registra que se disparó un lote automático
export async function registrarLoteAuto(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("ghl_approval_stats")
    .update({ ultimo_lote_at: new Date().toISOString() })
    .eq("campana_key", campana);
}

// Limpia el timer de intervalo al resolver el último pendiente.
// Garantiza que el siguiente cron dispare sin esperar el intervalo mínimo,
// compensando el tiempo perdido durante el bloqueo por pendientes.
export async function limpiarIntervaloDisparo(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("ghl_approval_stats")
    .update({ ultimo_lote_at: null })
    .eq("campana_key", campana);
  void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.intervalo_limpiado", fase: "ok", resultado: campana });
}

// Avanza (o reinicia) la página activa de la campaña.
// nextPage === null significa que se llegó al final → resetea a 1.
export async function actualizarPaginaCampana(
  campana: string,
  nextPage: number | null,
): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_approval_stats")
    .update({ pagina_campana: nextPage ?? 1 })
    .eq("campana_key", campana);
}

// Cuenta mensajes enviados hoy (medianoche CDMX = UTC-6)
export async function contarEnviadosHoy(campana: string): Promise<number> {
  const supabase = createServiceClient();
  const ahora = new Date();
  // Medianoche CDMX en UTC: hora UTC cuando CDMX marca las 00:00
  const cdmxMidnight = new Date(Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    // Si son antes de las 06:00 UTC, la "medianoche CDMX" fue ayer en UTC
    ahora.getUTCHours() < 6
      ? ahora.getUTCDate() - 1
      : ahora.getUTCDate(),
    6, 0, 0, 0,
  ));
  const { count } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("id", { count: "exact", head: true })
    .eq("campana", campana)
    .eq("enviado", true)
    .gte("enviado_at", cdmxMidnight.toISOString()) as { count: number | null };
  return count ?? 0;
}

// Cuenta mensajes pendientes de aprobación
export async function contarPendientes(campana: string): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("campana", campana)
    .eq("estado", "pendiente") as { count: number | null };
  return count ?? 0;
}

// Registra notificación de pausa y retorna true si debe notificar (cooldown 60 min)
export async function debeNotificarPausa(campana: string): Promise<boolean> {
  const stats = await obtenerStatsAprobacion(campana);
  if (!stats?.ultima_notif_pausa_at) return true;
  const hace60 = new Date(Date.now() - 60 * 60 * 1000);
  return new Date(stats.ultima_notif_pausa_at) < hace60;
}

export async function registrarNotifPausa(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("ghl_approval_stats")
    .update({ ultima_notif_pausa_at: new Date().toISOString() })
    .eq("campana_key", campana);
}

// Cuenta filas totales y excluidas (enviado=false) en ghl_campana_logs
export async function contarLogsCampana(
  campana: string
): Promise<{ total: number; excluidos: number }> {
  const supabase = createServiceClient();
  const [resTotal, resExcluidos] = await Promise.all([
    (supabase as any)
      .from("ghl_campana_logs")
      .select("id", { count: "exact", head: true })
      .eq("campana", campana) as Promise<{ count: number | null }>,
    (supabase as any)
      .from("ghl_campana_logs")
      .select("id", { count: "exact", head: true })
      .eq("campana", campana)
      .eq("enviado", false) as Promise<{ count: number | null }>,
  ]);
  return {
    total:     resTotal.count     ?? 0,
    excluidos: resExcluidos.count ?? 0,
  };
}

// Distribución de leads de la campaña por estado ECMatic
export interface EstadosLeadsCampana {
  sin_contactar: number;
  en_espera:     number;
  en_conversacion: number;
  cerrado:       number;
  inactivo:      number;
  total:         number;
}

const STAGES_CONVERSACION = new Set(["Interesado", "Propuesta", "Negociación"]);

export async function obtenerEstadosLeadsCampana(campana: string): Promise<EstadosLeadsCampana> {
  const supabase = createServiceClient();

  const { data: logs } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("ghl_contact_id, respuesta_tipo, convirtio")
    .eq("campana", campana)
    .eq("enviado", true) as {
      data: { ghl_contact_id: string; respuesta_tipo: string | null; convirtio: boolean | null }[] | null;
    };

  const resultado: EstadosLeadsCampana = { sin_contactar: 0, en_espera: 0, en_conversacion: 0, cerrado: 0, inactivo: 0, total: 0 };
  if (!logs?.length) return resultado;
  resultado.total = logs.length;

  const telefonos = logs.map((l) => `ghl_${l.ghl_contact_id}`);
  const { data: leads } = await (supabase as any)
    .from("leads")
    .select("telefono, archivado, pipeline_stage")
    .in("telefono", telefonos) as {
      data: { telefono: string; archivado: boolean; pipeline_stage: string }[] | null;
    };

  const leadMap = new Map((leads ?? []).map((l) => [l.telefono, l]));

  for (const log of logs) {
    const lead = leadMap.get(`ghl_${log.ghl_contact_id}`);
    if (log.convirtio === true)                                { resultado.cerrado++;        continue; }
    if (log.respuesta_tipo === "negativo" || lead?.archivado) { resultado.inactivo++;       continue; }
    if (!log.respuesta_tipo)                                   { resultado.sin_contactar++;  continue; }
    if (STAGES_CONVERSACION.has(lead?.pipeline_stage ?? ""))  { resultado.en_conversacion++; continue; }
    resultado.en_espera++;
  }

  return resultado;
}

// Reinicia todos los contadores y la ventana bayesiana a cero.
export async function reiniciarNivelesCampana(campana: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_approval_stats")
    .update({
      total:                  0,
      aprobados:              0,
      editados:               0,
      rechazados:             0,
      aprobados_consecutivos: 0,
      automatizado:           false,
      umbral_auto:            UMBRAL_AUTO_FIJO,
      decisions_window:       [],
      trust_score:            0,
      last_decision_at:       null,
      updated_at:             new Date().toISOString(),
    })
    .eq("campana_key", campana);
}

// Marca notificación SLA enviada e incrementa contador
export async function registrarNotificacionSLA(id: string, conteoActual: number): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_approval_queue")
    .update({
      ultima_notificacion_at: new Date().toISOString(),
      conteo_notificaciones:  conteoActual + 1,
    })
    .eq("id", id);
}
