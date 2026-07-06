// MPS-26 S94–S97 — Lógica de procesamiento de un seguimiento vencido.
// MPS-31 S113: IA y cascade diferidos al momento de revisión (lazy generation).
// El cron sólo encola con mensaje_ia="" y resuelve contacto/conv.
// Cascade Conectado sigue disparando directo vía GHL Workflow.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { type SeguimientoLead, avanzarNivel, cancelarPorTipo } from "@/services/seguimiento-lead";
import { obtenerHistorial, obtenerUltimoEntrante } from "@/services/mensajes";
import { buscarConversacionWA } from "@/lib/ghl/conversations-api";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { encolarMensajeGHL } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL } from "@/services/ghl-aprobacion-notif";
import { buscarTemplateCascada, registrarUsoTemplate } from "@/services/followup-templates";
import { inscribirEnWorkflow } from "@/lib/ghl/workflows-api";
import { evaluarContinuacion } from "@/lib/ai/evaluar-continuacion";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const CDMX_OFFSET    = -6;
const VENTANA_WA_MS  = 24 * 3_600_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export type ResultadoProcesamiento =
  | "encolado" | "directo_ghl" | "ya_en_cola"
  | "fallo_contacto" | "fallo_conv" | "fallo_ia" | "fallo_encolar";

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function obtenerNombreLead(leadId: string): Promise<string | null> {
  const { data } = await db()
    .from("leads").select("nombre").eq("id", leadId).maybeSingle() as
    { data: { nombre: string | null } | null };
  return data?.nombre ?? null;
}

export async function obtenerLinksLead(leadId: string): Promise<{ linkPago: string | null; linkApartado: string | null }> {
  const { data: lead } = await db()
    .from("leads").select("pipeline_ruta").eq("id", leadId).maybeSingle() as
    { data: { pipeline_ruta: string | null } | null };
  if (!lead?.pipeline_ruta) return { linkPago: null, linkApartado: null };

  const { data: pipeline } = await db()
    .from("pipelines").select("servicio_id").eq("ruta", lead.pipeline_ruta).maybeSingle() as
    { data: { servicio_id: string | null } | null };
  if (!pipeline?.servicio_id) return { linkPago: null, linkApartado: null };

  const { data: pagos } = await db()
    .from("servicio_pagos").select("tipo, url")
    .eq("servicio_id", pipeline.servicio_id).eq("activo", true) as
    { data: Array<{ tipo: string; url: string }> | null };
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
    .from("leads").select("telefono, nombre").eq("id", seg.lead_id).maybeSingle() as
    { data: { telefono: string; nombre: string | null } | null };
  if (!lead?.telefono) return null;
  return buscarOCrearContactoGHL(lead.telefono, lead.nombre).catch(() => null);
}

async function yaEnCola(seguimientoId: string): Promise<boolean> {
  const { count } = await db()
    .from("ghl_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("seguimiento_id", seguimientoId)
    .eq("estado", "pendiente") as { count: number | null };
  return (count ?? 0) > 0;
}

export async function posponerPorFallo(
  seg: SeguimientoLead, motivo: string, delayH: number, traceId: string,
): Promise<void> {
  const nuevo = new Date(Date.now() + delayH * 3_600_000);
  await db().from("seguimiento_lead").update({ proximo_at: nuevo.toISOString() }).eq("id", seg.id);
  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.posponer_fallo", fase: "warn", traceId,
    resultado: `motivo:${motivo} delay:${delayH}h → ${nuevo.toISOString()}`,
    metadata: { seguimientoId: seg.id, leadId: seg.lead_id, motivo, delayH },
  });
}

async function registrarIntento(seg: SeguimientoLead): Promise<void> {
  const ahora  = new Date();
  const cdmxMs = ahora.getTime() + CDMX_OFFSET * 3_600_000;
  const cdmx   = new Date(cdmxMs);
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

async function estaFueraDeVentanaWA(leadId: string): Promise<boolean> {
  const ultimo = await obtenerUltimoEntrante(leadId).catch(() => null);
  if (!ultimo) return true;
  return Date.now() - ultimo.getTime() > VENTANA_WA_MS;
}

// ── Procesamiento principal ───────────────────────────────────────────────────

export async function procesarSeguimiento(
  seg: SeguimientoLead,
  traceId: string,
): Promise<ResultadoProcesamiento> {
  const enCola = await yaEnCola(seg.id).catch(() => false);
  if (enCola) {
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.ya_en_cola", fase: "debug", traceId,
      resultado: "mensaje previo pendiente — posponiendo 1h",
      metadata:  { seguimientoId: seg.id, leadId: seg.lead_id },
    });
    await posponerPorFallo(seg, "ya_en_cola", 1, traceId);
    return "ya_en_cola";
  }

  const nivel = seg.nivel + 1;

  // Historial ligero (cap 10): para evaluarContinuacion + Haiku cascade Conectado
  const [nombre, contactId, historialRaw] = await Promise.all([
    obtenerNombreLead(seg.lead_id),
    resolverContactoGHL(seg),
    obtenerHistorial(seg.lead_id, 10).catch(() => ""),
  ]);

  if (!contactId) {
    await posponerPorFallo(seg, "sin_contacto_ghl", 4, traceId);
    return "fallo_contacto";
  }

  const convId = await resolverConvId({ ...seg, ghl_contact_id: contactId });
  if (!convId) {
    await posponerPorFallo(seg, "sin_conv_id", 2, traceId);
    return "fallo_conv";
  }

  const historialResumen = historialRaw || null;

  // ── Evaluación de continuación (solo si nivel >= 2) ───────────────────────
  if (nivel >= 2) {
    const { data: usoAngulos } = await db()
      .from("followup_template_uso_lead")
      .select("followup_templates(angulo:followup_angulos(codigo))")
      .eq("lead_id", seg.lead_id) as {
        data: { followup_templates: { angulo: { codigo: string } | null } | null }[] | null;
      };

    const angulosUsados = (usoAngulos ?? [])
      .map((r) => r.followup_templates?.angulo?.codigo)
      .filter(Boolean) as string[];

    const eval_ = await evaluarContinuacion({
      historial: historialResumen,
      angulosUsados,
      nivel,
      tipo: seg.tipo,
      leadId: seg.lead_id,
      traceId,
    }).catch(() => ({ decision: "continuar" as const, razon: "error_eval" }));

    if (eval_.decision === "pausar") {
      await cancelarPorTipo(seg.lead_id, seg.tipo);
      void logSistema({
        categoria: "cron", tipoAccion: "cron.seguimiento.ia_decision.pausar", fase: "ok", traceId,
        leadId: seg.lead_id, resultado: eval_.razon,
        metadata: { seguimientoId: seg.id, nivel, tipo: seg.tipo },
      });
      return "ya_en_cola";
    }

    if (eval_.decision === "escalar") {
      await avanzarNivel({ ...seg, nivel: seg.nivel + 99 }).catch(() => null);
      void logSistema({
        categoria: "cron", tipoAccion: "cron.seguimiento.ia_decision.escalar", fase: "ok", traceId,
        leadId: seg.lead_id, resultado: eval_.razon,
        metadata: { seguimientoId: seg.id, nivel, tipo: seg.tipo },
      });
      return "ya_en_cola";
    }
  }

  // ── Cascade Conectado: único path que sigue disparando directo en el cron ──
  // Aprobado/Sugerido y generación nueva quedan diferidos a la revisión (lazy).
  const cascade = await buscarTemplateCascada({
    leadId:          seg.lead_id,
    tipo:            seg.tipo,
    historialResumen,
  }).catch(() => null);

  if (cascade?.estado === "conectado" && cascade.template.ghl_workflow_id) {
    const ok = await inscribirEnWorkflow(
      contactId,
      cascade.template.ghl_workflow_id,
      { leadId: seg.lead_id, traceId },
    );
    if (ok) {
      await registrarUsoTemplate(cascade.template.id, seg.lead_id, seg.id);
      await avanzarNivel(seg);
      void registrarIntento(seg);
      return "directo_ghl";
    }
    // Si falla la inscripción, cae al encolado lazy
  }

  // ── Encolar con mensaje vacío — la IA se invoca al abrir la revisión ──────
  const labelContexto = `Recordatorio ${seg.tipo} · nivel ${nivel}${seg.gatillo_snapshot ? ` · ${seg.gatillo_snapshot}` : ""}`;
  const fueraDeVentana = await estaFueraDeVentanaWA(seg.lead_id).catch(() => false);

  const itemId = await encolarMensajeGHL({
    campana:          seg.campana ?? CAMPANA_ACTIVA,
    ghlContactId:     contactId,
    convId,
    leadEcmaticId:    seg.lead_id,
    nombre,
    mensajeLead:      labelContexto,
    mensajeIA:        "",
    contexto:         { tipo: seg.tipo, nivel, gatillo: seg.gatillo_snapshot },
    scoreIA:          fueraDeVentana ? 0 : 0.5,
    razonScore:       fueraDeVentana
      ? "⚠️ Fuera de ventana WA — enviar template desde GHL"
      : `${labelContexto} — generando mensaje IA…`,
    seguimientoId:    seg.id,
    requiereTemplate: fueraDeVentana,
  }).catch(() => null);

  if (!itemId) {
    await posponerPorFallo(seg, "fallo_encolar", 1, traceId);
    return "fallo_encolar";
  }

  await notificarMensajePendienteGHL({
    itemId, convId, contactId, nombre, mensajeLead: labelContexto,
    scoreIA:          fueraDeVentana ? 0 : 0.5,
    leadEcmaticId:    seg.lead_id,
    urgencia:         fueraDeVentana ? 2 : 1,
    requiereTemplate: fueraDeVentana,
  }).catch(() => null);

  void registrarIntento(seg);

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.encolar", fase: "ok", traceId,
    resultado: `item:${itemId} lazy:true fuera:${fueraDeVentana}`,
    metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, nivel, tipo: seg.tipo },
  });

  return "encolado";
}
