// GHL-9.8 / MPS-5 S39.4 — Cron cada 30 min: ejecuta follow-ups vencidos + detecta silencios.
// Ventana de envío: window_start–window_end CDMX (configurado en followup_config).
// avanzarNivel ya NO se llama aquí — se llama al aprobar/rechazar el item en la cola.
// Fixes auditoria: posponerPorFallo (evita loops infinitos) + yaEnCola (evita duplicados en cola).
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { obtenerVencidos, type SeguimientoLead } from "@/services/seguimiento-lead";
import { detectarSilencios } from "@/services/detectar-silencio";
import { generarFollowupGHL } from "@/lib/ai/generar-followup-ghl";
import { obtenerHistorial } from "@/services/mensajes";
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

async function obtenerLinksLead(leadId: string): Promise<{ linkPago: string | null; linkApartado: string | null }> {
  const { data: lead } = await db()
    .from("leads").select("pipeline_ruta").eq("id", leadId).maybeSingle() as { data: { pipeline_ruta: string | null } | null };
  if (!lead?.pipeline_ruta) return { linkPago: null, linkApartado: null };

  const { data: pipeline } = await db()
    .from("pipelines").select("servicio_id").eq("ruta", lead.pipeline_ruta).maybeSingle() as { data: { servicio_id: string | null } | null };
  if (!pipeline?.servicio_id) return { linkPago: null, linkApartado: null };

  const { data: pagos } = await db()
    .from("servicio_pagos").select("tipo, url")
    .eq("servicio_id", pipeline.servicio_id).eq("activo", true) as { data: Array<{ tipo: string; url: string }> | null };
  if (!pagos?.length) return { linkPago: null, linkApartado: null };

  const regulares = pagos.filter((p) => p.tipo !== "apartado");
  return {
    linkPago:     regulares[0]?.url ?? null,
    linkApartado: pagos.find((p) => p.tipo === "apartado")?.url ?? null,
  };
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

// Retorna true si ya existe un item pendiente en la cola para este seguimiento.
// Previene duplicados cuando el admin no ha aprobado el mensaje previo.
async function yaEnCola(seguimientoId: string): Promise<boolean> {
  const { count } = await db()
    .from("ghl_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("seguimiento_id", seguimientoId)
    .eq("estado", "pendiente") as { count: number | null };
  return (count ?? 0) > 0;
}

// Reschedula proximo_at cuando hay un fallo no-fatal.
// Evita que el lead quede atascado (proximo_at en el pasado para siempre).
async function posponerPorFallo(
  seg: SeguimientoLead,
  motivo: string,
  delayH: number,
  traceId: string,
): Promise<void> {
  const nuevo = new Date(Date.now() + delayH * 3_600_000);
  await db()
    .from("seguimiento_lead")
    .update({ proximo_at: nuevo.toISOString() })
    .eq("id", seg.id);
  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.posponer_fallo", fase: "warn", traceId,
    resultado: `motivo:${motivo} delay:${delayH}h → ${nuevo.toISOString()}`,
    metadata: { seguimientoId: seg.id, leadId: seg.lead_id, motivo, delayH },
  });
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

type ResultadoProcesamiento = "encolado" | "ya_en_cola" | "fallo_contacto" | "fallo_conv" | "fallo_ia" | "fallo_encolar";

async function procesarSeguimiento(seg: SeguimientoLead, traceId: string): Promise<ResultadoProcesamiento> {
  // Guard: no agregar duplicado si ya hay un pendiente esperando aprobación.
  // proximo_at se pospone +1h para que el lead salga del listado "atascados".
  const enCola = await yaEnCola(seg.id).catch(() => false);
  if (enCola) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.ya_en_cola", fase: "debug", traceId,
      resultado: "mensaje previo pendiente de aprobación — posponiendo 1h",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
    });
    await posponerPorFallo(seg, "ya_en_cola", 1, traceId);
    return "ya_en_cola";
  }

  const nivel = seg.nivel + 1;

  const config = await getFollowupConfig(seg.tipo).catch(() => null);
  const historialLimite = config?.historial_limite ?? 10;

  const [nombre, contactId, links, historial] = await Promise.all([
    obtenerNombreLead(seg.lead_id),
    resolverContactoGHL(seg),
    seg.tipo === "payment"
      ? obtenerLinksLead(seg.lead_id).catch(() => ({ linkPago: null, linkApartado: null }))
      : Promise.resolve({ linkPago: null, linkApartado: null }),
    obtenerHistorial(seg.lead_id, historialLimite).catch(() => ""),
  ]);

  if (!contactId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin contactId GHL — posponiendo 4h",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, ghlContactId: seg.ghl_contact_id },
    });
    await posponerPorFallo(seg, "sin_contacto_ghl", 4, traceId);
    return "fallo_contacto";
  }

  const convId = await resolverConvId({ ...seg, ghl_contact_id: contactId });
  if (!convId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "sin convId GHL — posponiendo 2h",
      metadata:  { seguimientoId: seg.id, contactId },
    });
    await posponerPorFallo(seg, "sin_conv_id", 2, traceId);
    return "fallo_conv";
  }

  const horarioPrometido = seg.horario_prometido
    ? new Date(seg.horario_prometido).toLocaleTimeString("es-MX", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
      })
    : null;

  const texto = await generarFollowupGHL(
    { nombre, tipo: seg.tipo, nivel, horarioPrometido, gatilloSnapshot: seg.gatillo_snapshot, historial: historial || null, ...links },
    { leadId: seg.lead_id, traceId },
  );

  if (!texto) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.enviar", fase: "warn", traceId,
      resultado: "IA no generó texto — posponiendo 1h",
      metadata:  { seguimientoId: seg.id },
    });
    await posponerPorFallo(seg, "ia_sin_texto", 1, traceId);
    return "fallo_ia";
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
    seguimientoId: seg.id,
  }).catch(() => null);

  if (!itemId) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.encolar", fase: "error", traceId,
      resultado: "encolar falló — posponiendo 1h",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
    });
    await posponerPorFallo(seg, "fallo_encolar", 1, traceId);
    return "fallo_encolar";
  }

  await notificarMensajePendienteGHL({
    itemId,
    convId,
    contactId,
    nombre,
    mensajeLead:   labelContexto,
    scoreIA:       0.75,
    leadEcmaticId: seg.lead_id,
    urgencia:      1,
  }).catch(() => null);

  void registrarIntento(seg);

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.encolar", fase: "ok", traceId,
    resultado: `item:${itemId} encolado (avanzarNivel al aprobar)`,
    metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, nivel, tipo: seg.tipo },
  });

  return "encolado";
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

    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.vencidos", fase: "debug", traceId,
      resultado: `${vencidos.length} vencidos encontrados`,
      metadata: {
        ids:       vencidos.map((s) => s.id.slice(-8)),
        tipos:     vencidos.map((s) => s.tipo),
        niveles:   vencidos.map((s) => s.nivel),
        tiene_ghl: vencidos.map((s) => !!s.ghl_contact_id),
      },
    });

    let enviados          = 0;
    let pospuestos        = 0;  // fuera de ventana horaria
    let ya_en_cola        = 0;  // mensaje previo pendiente de aprobación
    let pospuestos_fallo  = 0;  // fallo técnico (sin GHL, sin conv, sin texto, encolar)

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

      const res = await procesarSeguimiento(seg, traceId);
      if (res === "encolado")      enviados++;
      else if (res === "ya_en_cola") ya_en_cola++;
      else                           pospuestos_fallo++;
    }

    const resultado = {
      deteccion,
      vencidos:         vencidos.length,
      enviados,
      pospuestos,
      ya_en_cola,
      pospuestos_fallo,
      duracion_ms: Date.now() - inicio,
    };

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
