import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

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
  automatizado: boolean;
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

// Actualiza contadores globales de la campaña
export async function actualizarStatsAprobacion(
  campana: string,
  decision: "aprobado" | "editado" | "rechazado"
): Promise<void> {
  const supabase = createServiceClient();
  const stats = await obtenerStatsAprobacion(campana);
  if (!stats) return;

  const nuevos = {
    total:      stats.total + 1,
    aprobados:  stats.aprobados  + (decision === "aprobado"  ? 1 : 0),
    editados:   stats.editados   + (decision === "editado"   ? 1 : 0),
    rechazados: stats.rechazados + (decision === "rechazado" ? 1 : 0),
    updated_at: new Date().toISOString(),
  };

  const nuevaTasa = nuevos.total > 0 ? nuevos.aprobados / nuevos.total : 0;

  // Evaluar si debe cambiar modo automático
  const debeAutomatizar =
    !stats.automatizado &&
    nuevaTasa >= 0.95 &&
    nuevos.aprobados >= 50;

  await (supabase as any)
    .from("ghl_approval_stats")
    .update({
      ...nuevos,
      ...(debeAutomatizar && { automatizado: true }),
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
