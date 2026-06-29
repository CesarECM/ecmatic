// GHL-9.8 / MPS-5 S39.4 — Cron cada 30 min: ejecuta follow-ups vencidos + detecta silencios.
// Ventana de envío: window_start–window_end CDMX (configurado en followup_config).
// avanzarNivel ya NO se llama aquí — se llama al aprobar/rechazar el item en la cola.
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { obtenerVencidos, type SeguimientoLead } from "@/services/seguimiento-lead";
import { detectarSilencios } from "@/services/detectar-silencio";
import { generarFollowupGHL } from "@/lib/ai/generar-followup-ghl";
import { buscarConversacionWA } from "@/lib/ghl/conversations-api";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { encolarMensajeGHL, obtenerStatsAprobacion } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL } from "@/services/ghl-aprobacion-notif";
import { createServiceClient } from "@/lib/supabase/service";
import { getFollowupConfig } from "@/services/followup-config";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const CRON_SECRET    = process.env.CRON_SECRET;
const CDMX_OFFSET    = -6;

function horaEnCDMX(): number {
  return (new Date().getUTCHours() + 24 + CDMX_OFFSET) % 24;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

async function obtenerNombreLead(leadId: string): Promise<string | null> {
  const { data } = await db()
    .from("leads")
    .select("nombre")
    .eq("id", leadId)
    .maybeSingle() as { data: { nombre: string | null } | null };
  return data?.nombre ?? null;
}

async function resolverConvId(seg: SeguimientoLead): Promise<string | null> {
  if (seg.conv_id) return seg.conv_id;
  if (seg.ghl_contact_id) {
    const conv = await buscarConversacionWA(seg.ghl_contact_id).catch(() => null);
    return conv?.id ?? null;
  }
  return null;
}

async function resolverContactoGHL(seg: SeguimientoLead): Promise<string | null> {
  if (seg.ghl_contact_id) return seg.ghl_contact_id;
  const { data: lead } = await db()
    .from("leads")
    .select("telefono, nombre")
    .eq("id", seg.lead_id)
    .maybeSingle() as { data: { telefono: string; nombre: string | null } | null };
  if (!lead?.telefono) return null;
  return buscarOCrearContactoGHL(lead.telefono, lead.nombre).catch(() => null);
}

// Registra el intento en followup_attempts_log para aprendizaje bayesiano
async function registrarIntento(seg: SeguimientoLead): Promise<void> {
  const ahora = new Date();
  // Convertir a CDMX para slot correcto
  const cdmxMs = ahora.getTime() + CDMX_OFFSET * 3_600_000;
  const cdmx = new Date(cdmxMs);
  await db()
    .from("followup_attempts_log")
    .insert({
      seguimiento_id:   seg.id,
      lead_id:          seg.lead_id,
      sent_at:          ahora.toISOString(),
      day_of_week:      cdmx.getUTCDay(),
      hour_of_day:      cdmx.getUTCHours(),
      window_closes_at: new Date(ahora.getTime() + 24 * 3_600_000).toISOString(),
    })
    .catch((e: unknown) => void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.log_intento", fase: "error",
      resultado: String(e), metadata: { seguimientoId: seg.id },
    }));
}

async function procesarSeguimiento(seg: SeguimientoLead, traceId: string): Promise<void> {
  const nivel = seg.nivel + 1;

  const [nombre, contactId] = await Promise.all([
    obtenerNombreLead(seg.lead_id),
    resolverContactoGHL(seg),
  ]);

  if (!contactId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin contactId GHL — omitido (no se avanza nivel)",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
    });
    return;
  }

  const convId = await resolverConvId({ ...seg, ghl_contact_id: contactId });
  if (!convId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin convId GHL — omitido (no se avanza nivel)",
      metadata:  { seguimientoId: seg.id, contactId },
    });
    return;
  }

  const horarioPrometido = seg.horario_prometido
    ? new Date(seg.horario_prometido).toLocaleTimeString("es-MX", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
      })
    : null;

  const texto = await generarFollowupGHL(
    { nombre, tipo: seg.tipo, nivel, horarioPrometido, gatilloSnapshot: seg.gatillo_snapshot },
    { leadId: seg.lead_id, traceId },
  );

  if (!texto) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "IA no generó texto — omitido (no se avanza nivel)",
      metadata:  { seguimientoId: seg.id },
    });
    return;
  }

  const labelContexto = `Recordatorio ${seg.tipo} · nivel ${nivel}${seg.gatillo_snapshot ? ` · ${seg.gatillo_snapshot}` : ""}`;

  // Encolar con seguimientoId para que avanzarNivel se dispare al aprobar/rechazar
  const itemId = await encolarMensajeGHL({
    campana:       seg.campana ?? CAMPANA_ACTIVA,
    ghlContactId:  contactId,
    convId,
    leadEcmaticId: seg.lead_id,
    nombre,
    mensajeLead:   labelContexto,
    mensajeIA:     texto,
    contexto:      { tipo: seg.tipo, nivel, gatillo: seg.gatillo_snapshot },
    scoreIA:       0.75,
    razonScore:    `Recordatorio automático — ${labelContexto}`,
    seguimientoId: seg.id,  // MPS-5: avanzarNivel se dispara al aprobar/rechazar este item
  }).catch(() => null);

  await notificarMensajePendienteGHL({
    itemId:        itemId ?? "error",
    convId,
    contactId,
    nombre,
    mensajeLead:   labelContexto,
    scoreIA:       0.75,
    leadEcmaticId: seg.lead_id,
    urgencia:      1,
  }).catch(() => null);

  // Registrar intento para aprendizaje bayesiano
  void registrarIntento(seg);

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.encolar", fase: itemId ? "ok" : "error", traceId,
    resultado: itemId ? `item:${itemId} encolado (avanzarNivel al aprobar)` : "encolar falló",
    metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, nivel, tipo: seg.tipo },
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const statsActiva = await obtenerStatsAprobacion(CAMPANA_ACTIVA);
  if (!statsActiva?.activa) {
    return NextResponse.json({ ok: true, motivo: "campana_inactiva" });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento", fase: "inicio", traceId,
    resultado: "Iniciando cron de seguimiento adaptativo",
  });

  try {
    const deteccion = await detectarSilencios();
    const vencidos  = await obtenerVencidos();

    let enviados   = 0;
    let pospuestos = 0;

    for (const seg of vencidos) {
      // Leer ventana desde config (graceful: fallback a 9-22)
      const config = await getFollowupConfig(seg.tipo).catch(() => null);
      const horaInicio = config?.window_start ?? 9;
      const horaFin    = config?.window_end   ?? 22;
      const horaCDMX   = horaEnCDMX();

      if (horaCDMX < horaInicio || horaCDMX >= horaFin) {
        // Fuera de ventana: posponer al inicio del siguiente día hábil
        const mañana = new Date();
        mañana.setUTCDate(mañana.getUTCDate() + 1);
        mañana.setUTCHours(horaInicio - CDMX_OFFSET, 0, 0, 0);
        await db()
          .from("seguimiento_lead")
          .update({ proximo_at: mañana.toISOString() })
          .eq("id", seg.id);
        pospuestos++;
        continue;
      }

      await procesarSeguimiento(seg, traceId);
      enviados++;
    }

    const resultado = { deteccion, vencidos: vencidos.length, enviados, pospuestos, duracion_ms: Date.now() - inicio };

    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento", fase: "ok", traceId,
      resultado: JSON.stringify(resultado), metadata: resultado,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
