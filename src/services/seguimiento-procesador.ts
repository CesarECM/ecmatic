// MPS-26 S94–S97 — Lógica de procesamiento de un seguimiento vencido.
// Extraído de seguimiento/route.ts para respetar el límite de 300 líneas.
// Cascade: Conectado → Aprobado → Sugerido → generar nuevo.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { type SeguimientoLead, avanzarNivel, cancelarPorTipo } from "@/services/seguimiento-lead";
import { generarFollowupGHL } from "@/lib/ai/generar-followup-ghl";
import { seleccionarAngulo } from "@/lib/ai/seleccionar-angulo";
import { obtenerHistorial, obtenerUltimoEntrante } from "@/services/mensajes";
import { buscarConversacionWA } from "@/lib/ghl/conversations-api";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { encolarMensajeGHL } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL } from "@/services/ghl-aprobacion-notif";
import { getFollowupConfig } from "@/services/followup-config";
import { buscarTemplateCascada, guardarTemplateSugerido, registrarUsoTemplate } from "@/services/followup-templates";
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

async function obtenerNombreLead(leadId: string): Promise<string | null> {
  const { data } = await db()
    .from("leads").select("nombre").eq("id", leadId).maybeSingle() as
    { data: { nombre: string | null } | null };
  return data?.nombre ?? null;
}

async function obtenerLinksLead(leadId: string): Promise<{ linkPago: string | null; linkApartado: string | null }> {
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

  const nivel  = seg.nivel + 1;
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
    await posponerPorFallo(seg, "sin_contacto_ghl", 4, traceId);
    return "fallo_contacto";
  }

  const convId = await resolverConvId({ ...seg, ghl_contact_id: contactId });
  if (!convId) {
    await posponerPorFallo(seg, "sin_conv_id", 2, traceId);
    return "fallo_conv";
  }

  const historialResumen = historial || null;

  // ── MPS-26 S100: evaluación de continuación (solo si nivel >= 2) ──────────
  if (nivel >= 2) {
    // Obtener ángulos ya usados con este lead para pasarlos al evaluador
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
      return "ya_en_cola"; // reusa el counter de "sin acción"
    }

    if (eval_.decision === "escalar") {
      // avanzarNivel con max_intentos+1 dispara la escalación existente
      await avanzarNivel({ ...seg, nivel: seg.nivel + 99 }).catch(() => null);
      void logSistema({
        categoria: "cron", tipoAccion: "cron.seguimiento.ia_decision.escalar", fase: "ok", traceId,
        leadId: seg.lead_id, resultado: eval_.razon,
        metadata: { seguimientoId: seg.id, nivel, tipo: seg.tipo },
      });
      return "ya_en_cola";
    }
  }

  // ── MPS-26: cascade Conectado → Aprobado → Sugerido ──────────────────────
  const cascade = await buscarTemplateCascada({
    leadId:          seg.lead_id,
    tipo:            seg.tipo,
    historialResumen,
  }).catch(() => null);

  // Rama Conectado: envío directo vía GHL Workflow (sin cola de aprobación)
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
    // Si falla la inscripción, cae al path normal
  }

  // ── Determinar texto a usar (template reutilizado o generación nueva) ──────

  let texto: string;
  let templateId: string | null = null;

  if (cascade && (cascade.estado === "aprobado" || cascade.estado === "sugerido")) {
    texto      = cascade.template.texto;
    templateId = cascade.template.id;
  } else {
    // Sin cascade: seleccionar ángulo bayesiano + generar texto fresco
    const angulo = await seleccionarAngulo({
      tipo:    seg.tipo,
      nivel,
      leadId:  seg.lead_id,
    }).catch(() => null);

    if (!angulo) {
      await posponerPorFallo(seg, "sin_angulo", 1, traceId);
      return "fallo_ia";
    }

    const horarioPrometido = seg.horario_prometido
      ? new Date(seg.horario_prometido).toLocaleTimeString("es-MX", {
          hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
        })
      : null;

    texto = await generarFollowupGHL(
      { nombre, tipo: seg.tipo, nivel, angulo, horarioPrometido,
        gatilloSnapshot: seg.gatillo_snapshot, historial: historialResumen, ...links },
      { leadId: seg.lead_id, traceId },
    );

    if (!texto) {
      await posponerPorFallo(seg, "ia_sin_texto", 1, traceId);
      return "fallo_ia";
    }

    // Auto-guardar como Sugerido (embedding se genera async)
    templateId = await guardarTemplateSugerido({
      tipo:     seg.tipo,
      anguloId: angulo.id,
      texto,
    }).catch(() => null);
  }

  const labelContexto = `Recordatorio ${seg.tipo} · nivel ${nivel}${seg.gatillo_snapshot ? ` · ${seg.gatillo_snapshot}` : ""}`;
  const fueraDeVentana = await estaFueraDeVentanaWA(seg.lead_id).catch(() => false);

  const itemId = await encolarMensajeGHL({
    campana:          seg.campana ?? CAMPANA_ACTIVA,
    ghlContactId:     contactId,
    convId,
    leadEcmaticId:    seg.lead_id,
    nombre,
    mensajeLead:      labelContexto,
    mensajeIA:        texto,
    contexto:         { tipo: seg.tipo, nivel, gatillo: seg.gatillo_snapshot, templateId },
    scoreIA:          fueraDeVentana ? 0 : (cascade ? 0.85 : 0.75),
    razonScore:       fueraDeVentana
      ? "⚠️ Fuera de ventana WA — enviar template desde GHL"
      : cascade
        ? `Template ${cascade.estado} reutilizado — ${labelContexto}`
        : `Generado por IA (ángulo: ${cascade ?? "nuevo"}) — ${labelContexto}`,
    seguimientoId:    seg.id,
    requiereTemplate: fueraDeVentana,
    templateId:       templateId ?? undefined,
  }).catch(() => null);

  if (!itemId) {
    await posponerPorFallo(seg, "fallo_encolar", 1, traceId);
    return "fallo_encolar";
  }

  if (templateId && cascade) {
    void registrarUsoTemplate(templateId, seg.lead_id, seg.id);
  }

  await notificarMensajePendienteGHL({
    itemId, convId, contactId, nombre, mensajeLead: labelContexto,
    scoreIA:          fueraDeVentana ? 0 : (cascade ? 0.85 : 0.75),
    leadEcmaticId:    seg.lead_id,
    urgencia:         fueraDeVentana ? 2 : 1,
    requiereTemplate: fueraDeVentana,
  }).catch(() => null);

  void registrarIntento(seg);

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento.encolar", fase: "ok", traceId,
    resultado: `item:${itemId} cascade:${cascade?.estado ?? "nuevo"} template:${templateId?.slice(-8) ?? "none"}`,
    metadata:  { seguimientoId: seg.id, leadId: seg.lead_id, nivel, tipo: seg.tipo },
  });

  return "encolado";
}
