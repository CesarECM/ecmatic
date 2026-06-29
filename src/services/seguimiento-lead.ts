// MPS-5 S39.3 — CRUD y scheduling del sistema de seguimientos automáticos.
// Tipos actualizados: nurturing | conversational | payment
// avanzarNivel usa backoff exponencial desde followup_config (Capa 1 + 2)
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { obtenerGatillosActivos } from "@/services/gatillos";
import { getFollowupConfig, type TipoFollowup } from "@/services/followup-config";
import { calcularProximoAt } from "@/lib/followup/timing-motor";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { obtenerOCrearConversacionWA, enviarMensajeGHL } from "@/lib/ghl/conversations-api";

export type TipoSeguimiento = TipoFollowup;
export type EstadoSeguimiento = "activo" | "completado" | "cancelado" | "escalado";

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
  // Primer intento: nivel 1 → delay = base_hours (no backoff aún)
  const proximo = params.proximoAt ?? await calcularProximoAt({ leadId: params.leadId, tipo: params.tipo, nivel: 1 }).catch(() => new Date(Date.now() + 4 * 3_600_000));

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
    const errObj = error as { code?: string; message?: string };
    const code = errObj?.code ?? "";
    const msg  = errObj?.message ?? JSON.stringify(error);
    if (code !== "23505" && !msg.includes("unique")) {
      void logSistema({
        categoria: "servicio", tipoAccion: "seguimiento.crear", fase: "error",
        resultado: `${code}: ${msg}`.slice(0, 200),
        metadata: { leadId: params.leadId, tipo: params.tipo },
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
  horarioPrometido: Date,
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

// Marca el seguimiento como completado (lead respondió / envió comprobante).
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

// Cancela el seguimiento activo de un tipo específico para un lead.
// Usado al transicionar entre tipos (ej. confirmar demo cancela nurturing/conversational).
export async function cancelarPorTipo(leadId: string, tipo: TipoSeguimiento): Promise<void> {
  const { error } = await db()
    .from("seguimiento_lead")
    .update({ estado: "cancelado" })
    .eq("lead_id", leadId)
    .eq("tipo", tipo)
    .eq("estado", "activo");

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.cancelar_tipo", fase: "error",
      resultado: String(error), metadata: { leadId, tipo },
    });
  }
}

// Avanza al siguiente nivel con timing adaptativo, o cancela/escala si se alcanzó el máximo.
// NOTA: se llama al APROBAR el item en la cola, no al encolar — evita cascada prematura.
export async function avanzarNivel(seg: SeguimientoLead): Promise<void> {
  const nextNivel = seg.nivel + 1;
  const config = await getFollowupConfig(seg.tipo);

  if (nextNivel > config.max_intentos) {
    // payment y demo_agendado: escalar a humano en lugar de cancelar silenciosamente
    if (seg.tipo === "payment" || seg.tipo === "demo_agendado") {
      await db()
        .from("seguimiento_lead")
        .update({ estado: "escalado" })
        .eq("id", seg.id);

      void logSistema({
        categoria: "servicio", tipoAccion: "seguimiento.escalar", fase: "ok",
        resultado: `${seg.tipo} max_intentos:${config.max_intentos} → escalado`,
        metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
      });

      void notificarEscalacion(seg);
      return;
    }

    await db()
      .from("seguimiento_lead")
      .update({ estado: "cancelado" })
      .eq("id", seg.id);

    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.cancelar", fase: "ok",
      resultado: `max_intentos:${config.max_intentos} — cancelado`,
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, tipo: seg.tipo },
    });
    return;
  }

  // Calcular próximo timestamp con motor adaptativo (Capa 1 + 2)
  const proximo = await calcularProximoAt({
    leadId: seg.lead_id,
    tipo:   seg.tipo,
    nivel:  nextNivel,
  }).catch(() => {
    // Fallback seguro si el motor falla: usar base_hours
    return new Date(Date.now() + config.base_hours * 3_600_000);
  });

  await db()
    .from("seguimiento_lead")
    .update({ nivel: nextNivel, proximo_at: proximo.toISOString() })
    .eq("id", seg.id);

  void logSistema({
    categoria: "servicio", tipoAccion: "seguimiento.avanzar", fase: "ok",
    resultado: `nivel:${seg.nivel}→${nextNivel} proximo:${proximo.toISOString()}`,
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

// Devuelve un seguimiento por ID (para avanzarNivel desde actions de aprobación).
export async function obtenerPorId(seguimientoId: string): Promise<SeguimientoLead | null> {
  const { data } = await db()
    .from("seguimiento_lead")
    .select("*")
    .eq("id", seguimientoId)
    .maybeSingle() as { data: SeguimientoLead | null };
  return data ?? null;
}

// Notificación WA al admin cuando payment o demo_agendado agotan intentos sin respuesta.
async function notificarEscalacion(seg: SeguimientoLead): Promise<void> {
  const adminWa = process.env.ADMIN_WHATSAPP;
  if (!adminWa) return;

  const { data: lead } = await db()
    .from("leads").select("nombre").eq("id", seg.lead_id).maybeSingle() as { data: { nombre: string | null } | null };

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
  const nombre   = lead?.nombre ?? seg.lead_id.slice(-8);
  const fichaUrl = `${BASE_URL}/admin/leads/${seg.lead_id}`;

  const [emoji, titulo, detalle] = seg.tipo === "payment"
    ? ["🚨", "Escalación de pago — acción manual requerida", `Agotó ${seg.nivel} recordatorios de pago sin responder.`]
    : ["📅", "Lead post-demo sin respuesta — revisión requerida", `Agotó ${seg.nivel} seguimientos post-reunión sin responder.`];

  const texto = `${emoji} *${titulo}*\n\n👤 ${nombre}\n📋 ${detalle}\n🔗 Ficha → ${fichaUrl}`;

  try {
    const adminContactId = await buscarOCrearContactoGHL(adminWa, "César Admin");
    if (!adminContactId) return;
    const adminConvId = await obtenerOCrearConversacionWA(adminContactId);
    if (!adminConvId) return;
    await enviarMensajeGHL(adminConvId, texto, adminContactId);
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.escalar.notif", fase: "ok",
      resultado: `WA admin: tipo=${seg.tipo}`, metadata: { seguimientoId: seg.id },
    });
  } catch (err) {
    void logSistema({
      categoria: "servicio", tipoAccion: "seguimiento.escalar.notif", fase: "error",
      resultado: String(err).slice(0, 200), metadata: { seguimientoId: seg.id },
    });
  }
}
