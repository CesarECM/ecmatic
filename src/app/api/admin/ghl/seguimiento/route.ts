// GHL-9.8 — Cron cada 30 min: ejecuta follow-ups vencidos + detecta nuevos silencios.
// Ventana de envío: 09:00–22:00 CDMX (UTC-6, México no tiene DST desde 2022).
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { obtenerVencidos, avanzarNivel, type SeguimientoLead } from "@/services/seguimiento-lead";
import { detectarSilencios } from "@/services/detectar-silencio";
import { generarFollowupGHL } from "@/lib/ai/generar-followup-ghl";
import { enviarMensajeGHL, buscarConversacionWA } from "@/lib/ghl/conversations-api";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { createServiceClient } from "@/lib/supabase/service";

const CRON_SECRET = process.env.CRON_SECRET;
const CDMX_OFFSET = -6; // UTC-6 permanente

function horaEnCDMX(): number {
  const ahora = new Date();
  return (ahora.getUTCHours() + 24 + CDMX_OFFSET) % 24;
}

function dentroDeLaVentana(): boolean {
  const hora = horaEnCDMX();
  return hora >= 9 && hora < 22;
}

// Proximo envío a las 09:00 CDMX del siguiente día
function proximoDia09(): Date {
  const ahora = new Date();
  const mañana = new Date(ahora);
  mañana.setUTCDate(mañana.getUTCDate() + 1);
  mañana.setUTCHours(9 - CDMX_OFFSET, 0, 0, 0); // 15:00 UTC = 09:00 CDMX
  return mañana;
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

  // Para leads con teléfono regular, buscar o crear en GHL
  const { data: lead } = await db()
    .from("leads")
    .select("telefono, nombre")
    .eq("id", seg.lead_id)
    .maybeSingle() as { data: { telefono: string; nombre: string | null } | null };

  if (!lead?.telefono) return null;
  return buscarOCrearContactoGHL(lead.telefono, lead.nombre).catch(() => null);
}

async function procesarSeguimiento(seg: SeguimientoLead, traceId: string): Promise<void> {
  const nivel = seg.nivel + 1; // nivel del mensaje a enviar (1-based para el copy)

  // Obtener datos necesarios
  const [nombre, contactId] = await Promise.all([
    obtenerNombreLead(seg.lead_id),
    resolverContactoGHL(seg),
  ]);

  if (!contactId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin contactId GHL — omitido",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
    });
    await avanzarNivel(seg);
    return;
  }

  const convId = await resolverConvId({ ...seg, ghl_contact_id: contactId });
  if (!convId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin convId GHL — omitido",
      metadata:  { seguimientoId: seg.id, contactId },
    });
    await avanzarNivel(seg);
    return;
  }

  // Generar copy del follow-up
  const horarioPrometido = seg.horario_prometido
    ? new Date(seg.horario_prometido).toLocaleTimeString("es-MX", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
      })
    : null;

  const texto = await generarFollowupGHL(
    {
      nombre,
      tipo:             seg.tipo,
      nivel,
      horarioPrometido: horarioPrometido,
      gatilloSnapshot:  seg.gatillo_snapshot,
    },
    { leadId: seg.lead_id, traceId }
  );

  if (!texto) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "IA no generó texto — omitido",
      metadata:  { seguimientoId: seg.id },
    });
    await avanzarNivel(seg);
    return;
  }

  // Enviar vía GHL
  try {
    await enviarMensajeGHL(convId, texto, contactId);
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "ok", traceId,
      resultado: texto.slice(0, 80),
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, nivel, tipo: seg.tipo },
    });
  } catch (e) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "error", traceId,
      resultado: String(e),
      metadata:  { seguimientoId: seg.id, contactId, convId },
    });
  }

  await avanzarNivel(seg);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento", fase: "inicio", traceId,
    resultado: "Iniciando cron de seguimiento",
  });

  try {
    // 1. Detectar silencios nuevos
    const deteccion = await detectarSilencios();

    // 2. Procesar follow-ups vencidos
    const vencidos = await obtenerVencidos();

    let enviados = 0;
    let pospuestos = 0;

    for (const seg of vencidos) {
      if (!dentroDeLaVentana()) {
        // Fuera de horario — posponer al día siguiente a las 9am
        await db()
          .from("seguimiento_lead")
          .update({ proximo_at: proximoDia09().toISOString() })
          .eq("id", seg.id);
        pospuestos++;
        continue;
      }

      await procesarSeguimiento(seg, traceId);
      enviados++;
    }

    const resultado = {
      deteccion,
      vencidos:   vencidos.length,
      enviados,
      pospuestos,
      duracion_ms: Date.now() - inicio,
    };

    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento", fase: "ok", traceId,
      resultado: JSON.stringify(resultado),
      metadata:  resultado,
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
