// GHL-9.3 — CRUD y scheduling del sistema de seguimientos automáticos.
// Cubre pago_pendiente, silencio_ghl y silencio_funnel.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { obtenerGatillosActivos } from "@/services/gatillos";

export type TipoSeguimiento = "pago_pendiente" | "silencio_ghl" | "silencio_funnel";
export type EstadoSeguimiento = "activo" | "completado" | "cancelado";

export interface SeguimientoLead {
  id: string;
  lead_id: string;
  tipo: TipoSeguimiento;
  ghl_contact_id: string | null;
  conv_id: string | null;
  campana: string | null;
  estado: EstadoSeguimiento;
  nivel: number;
  proximo_at: string;
  horario_prometido: string | null;
  gatillo_snapshot: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// Máximo de follow-ups antes de cancelar (por tipo)
const MAX_NIVEL: Record<TipoSeguimiento, number> = {
  pago_pendiente: 3,
  silencio_ghl:   2,
  silencio_funnel: 2,
};

// Horas de espera entre niveles (en horas)
const HORAS_ENTRE_NIVELES = 4;

async function obtenerGatilloActivo(): Promise<string | null> {
  try {
    const gatillos = await obtenerGatillosActivos();
    const urgente = gatillos.find((g) =>
      g.tipo === "precio_vigente" || g.tipo === "urgencia_fecha" || g.tipo === "escasez_cupo"
    );
    return urgente ? `${urgente.nombre}: ${urgente.valor_actual}` : null;
  } catch {
    return null;
  }
}

// Crea un nuevo seguimiento. Si ya existe uno activo para el lead, no crea otro.
export async function crearSeguimiento(params: {
  leadId: string;
  tipo: TipoSeguimiento;
  ghlContactId?: string | null;
  convId?: string | null;
  campana?: string | null;
  horarioprometido?: Date | null;
  proximoAt?: Date;
}): Promise<string | null> {
  const gatillo = await obtenerGatilloActivo();
  const proximo = params.proximoAt ?? new Date(Date.now() + HORAS_ENTRE_NIVELES * 3600 * 1000);

  const { data, error } = await db()
    .from("seguimiento_lead")
    .insert({
      lead_id:          params.leadId,
      tipo:             params.tipo,
      ghl_contact_id:   params.ghlContactId ?? null,
      conv_id:          params.convId ?? null,
      campana:          params.campana ?? null,
      estado:           "activo",
      nivel:            0,
      proximo_at:       proximo.toISOString(),
      horario_prometido: params.horarioprometido?.toISOString() ?? null,
      gatillo_snapshot:  gatillo,
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (error) {
    // Conflicto de unique index = ya existe uno activo → no es error, simplemente ignorar
    const msg = String(error);
    if (!msg.includes("unique") && !msg.includes("23505")) {
      void logSistema({
        categoria: "servicio", tipoAccion: "seguimiento.crear", fase: "error",
        resultado: msg, metadata: { leadId: params.leadId, tipo: params.tipo },
      });
    }
    return null;
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "seguimiento.crear", fase: "ok",
    resultado: `id:${data?.id} tipo:${params.tipo}`,
    metadata:  { leadId: params.leadId, tipo: params.tipo, proximo_at: proximo.toISOString() },
  });

  return data?.id ?? null;
}

// Actualiza la hora del próximo follow-up (cuando el lead dice "a las 7pm").
export async function actualizarHorarioPrometido(
  seguimientoId: string,
  horarioPrometido: Date
): Promise<void> {
  const { error } = await db()
    .from("seguimiento_lead")
    .update({
      horario_prometido: horarioPrometido.toISOString(),
      proximo_at:        horarioPrometido.toISOString(),
    })
    .eq("id", seguimientoId)
    .eq("estado", "activo");

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.horario", fase: "error",
      resultado: String(error), metadata: { seguimientoId },
    });
  }
}

// Marca el seguimiento como completado (lead envió comprobante o respondió).
export async function marcarCompletado(leadId: string): Promise<void> {
  const { error } = await db()
    .from("seguimiento_lead")
    .update({ estado: "completado" })
    .eq("lead_id", leadId)
    .eq("estado", "activo");

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.completar", fase: "error",
      resultado: String(error), metadata: { leadId },
    });
  }
}

// Avanza al siguiente nivel y reprograma, o cancela si se alcanzó el máximo.
export async function avanzarNivel(seg: SeguimientoLead): Promise<void> {
  const nextNivel = seg.nivel + 1;
  const maxNivel  = MAX_NIVEL[seg.tipo];

  if (nextNivel > maxNivel) {
    await db()
      .from("seguimiento_lead")
      .update({ estado: "cancelado" })
      .eq("id", seg.id);

    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.cancelar", fase: "ok",
      resultado: `nivel_max:${maxNivel} — cancelado`,
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, tipo: seg.tipo },
    });
    return;
  }

  const proximo = new Date(Date.now() + HORAS_ENTRE_NIVELES * 3600 * 1000);

  await db()
    .from("seguimiento_lead")
    .update({ nivel: nextNivel, proximo_at: proximo.toISOString() })
    .eq("id", seg.id);

  void logSistema({
    categoria: "servicio", tipoAccion: "seguimiento.avanzar", fase: "ok",
    resultado: `nivel:${seg.nivel}→${nextNivel}`,
    metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, proximo_at: proximo.toISOString() },
  });
}

// Retorna todos los seguimientos activos cuyo proximo_at ya venció.
export async function obtenerVencidos(): Promise<SeguimientoLead[]> {
  const { data, error } = await db()
    .from("seguimiento_lead")
    .select("*")
    .eq("estado", "activo")
    .lte("proximo_at", new Date().toISOString())
    .order("proximo_at", { ascending: true })
    .limit(100) as { data: SeguimientoLead[] | null; error: unknown };

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.vencidos", fase: "error",
      resultado: String(error),
    });
    return [];
  }
  return data ?? [];
}

// Devuelve el seguimiento activo de un lead (si existe).
export async function obtenerActivo(leadId: string): Promise<SeguimientoLead | null> {
  const { data } = await db()
    .from("seguimiento_lead")
    .select("*")
    .eq("lead_id", leadId)
    .eq("estado", "activo")
    .maybeSingle() as { data: SeguimientoLead | null };
  return data ?? null;
}
