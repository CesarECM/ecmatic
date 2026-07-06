"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { agendarLlamadaAdmin, eliminarLlamada, type ObjetivoLlamada } from "@/services/llamadas";
import { moverLead, asignarVendedor } from "@/services/pipeline";
import { moverLeadEnPipeline } from "@/services/pipeline-multi";
import { pausarNurturing, reanudarNurturing } from "@/services/nurturing";
import { createServiceClient } from "@/lib/supabase/service";
import { emitirFactura, construirItemServicio } from "@/lib/facturama/client";
import { marcarPrivacidadAceptada } from "@/services/privacidad";
import { agregarEntradaManualContexto } from "@/services/contexto";
import { headers } from "next/headers";
import { logSistema } from "@/services/log-sistema";
import { diffObjects } from "@/lib/diff";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { enviarMensajeGHLFragmentado } from "@/lib/ghl/conversations-api";
import { guardarMensaje } from "@/services/mensajes";
import {
  resolverItemAprobacion,
  actualizarStatsAprobacion,
  obtenerStatsAprobacion,
} from "@/services/ghl-aprobacion";
import { crearRecurso, registrarCierre } from "@/services/conocimiento";
import { avanzarNivel, obtenerPorId, posponerSeguimiento4h } from "@/services/seguimiento-lead";
import {
  promoverTemplate, eliminarTemplateSiSugerido,
  buscarTemplateCascada, guardarTemplateSugerido, registrarUsoTemplate,
} from "@/services/followup-templates";
import { detectarPatronGHLItem } from "@/services/kbi/detector";
import { obtenerHistorial, obtenerUltimoEntrante } from "@/services/mensajes";
import { obtenerNombreLead, obtenerLinksLead } from "@/services/seguimiento-procesador";
import { generarFollowupGHL, generarRespuestaConversacional } from "@/lib/ai/generar-followup-ghl";
import { seleccionarAngulo } from "@/lib/ai/seleccionar-angulo";
import { getFollowupConfig } from "@/services/followup-config";

export async function moverLeadDesdePerfilAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !nuevaEtapa) return;
  await moverLead(leadId, nuevaEtapa, "admin");
  void logSistema({ categoria: "ui", tipoAccion: "leads.mover", fase: "ok", leadId, resultado: nuevaEtapa });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

export async function asignarVendedorAction(formData: FormData) {
  const leadId    = formData.get("leadId")    as string;
  const vendedorId = formData.get("vendedorId") as string;

  void logSistema({
    categoria: "ui", tipoAccion: "leads.asignar-vendedor", fase: "inicio",
    leadId: leadId ?? undefined,
    resultado: `leadId="${leadId ?? "vacío"}", vendedorId="${vendedorId ?? "vacío"}"`,
  });

  if (!leadId) {
    void logSistema({ categoria: "ui", tipoAccion: "leads.asignar-vendedor", fase: "warn", resultado: "leadId vacío — acción abortada" });
    return;
  }

  try {
    await asignarVendedor(leadId, vendedorId || null);
    void logSistema({
      categoria: "ui", tipoAccion: "leads.asignar-vendedor", fase: "ok",
      leadId, metadata: { vendedor_id: vendedorId || null },
    });
  } catch (err) {
    void logSistema({
      categoria: "ui", tipoAccion: "leads.asignar-vendedor", fase: "error",
      leadId, resultado: String(err),
    });
    throw err;
  }

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

// S12.5 — Guarda campos B2B en metadata del lead
export async function actualizarDatosB2BAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  if (!leadId) return;

  const db = createServiceClient();
  const { data: lead } = await db.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};

  const metaAnterior = { ...meta };
  const campos = ["empresa", "cargo", "tamano_empresa", "rfc"] as const;
  for (const campo of campos) {
    const val = (formData.get(campo) as string)?.trim();
    if (val) meta[campo] = val;
    else delete meta[campo];
  }

  await db.from("leads").update({ metadata: meta }).eq("id", leadId);
  const cambios = diffObjects(metaAnterior, meta);
  void logSistema({ categoria: "ui", tipoAccion: "leads.actualizar-b2b", fase: "ok", leadId, metadata: { cambios } });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S12.6 — Emite factura CFDI 4.0 vía Facturama sandbox
export const emitirFacturaAction = safeAction(async (
  formData: FormData
): Promise<{ uuid: string }> => {
  const leadId   = formData.get("leadId") as string;
  const monto    = Number(formData.get("monto"));
  const desc     = (formData.get("descripcion") as string)?.trim();
  const cpFiscal = (formData.get("cp_fiscal") as string)?.trim();

  if (!leadId || !monto || monto <= 0) throw new Error("Monto inválido");

  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("nombre, metadata")
    .eq("id", leadId)
    .single();

  const meta   = (lead?.metadata as Record<string, unknown>) ?? {};
  const rfc    = meta.rfc as string | undefined;
  const nombre = (lead?.nombre ?? "PUBLICO EN GENERAL") as string;

  if (!rfc) throw new Error("El lead no tiene RFC registrado");

  const cfdiUse     = (meta.cfdi_uso as string)      ?? "G03";
  const regimen     = (meta.regimen_fiscal as string) ?? "616";
  const cp          = cpFiscal || (meta.cp_fiscal as string) || (process.env.FACTURAMA_CP_EMISOR ?? "00000");
  const cpEmisor    = process.env.FACTURAMA_CP_EMISOR ?? "00000";
  const descripcion = desc || "Servicio de certificación CONOCER";

  const resultado = await emitirFactura({
    Currency: "MXN",
    ExpeditionPlace: cpEmisor,
    PaymentForm: "03",
    PaymentMethod: "PUE",
    CfdiType: "I",
    Receiver: { Rfc: rfc, Name: nombre, CfdiUse: cfdiUse, FiscalRegime: regimen, TaxZipCode: cp },
    Items: [construirItemServicio(descripcion, monto)],
  });

  if (!resultado) throw new Error("Facturama no configurado (faltan credenciales)");

  await db
    .from("leads")
    .update({ metadata: { ...meta, cfdi_uuid: resultado.Uuid, cfdi_id: resultado.Id } })
    .eq("id", leadId);

  void logSistema({ categoria: "ui", tipoAccion: "leads.emitir-factura", fase: "ok", leadId, resultado: resultado.Uuid, metadata: { cfdi_id: resultado.Id, monto } });
  revalidatePath(`/admin/leads/${leadId}`);
  return { uuid: resultado.Uuid };
});

// S12.9 — Registra aceptación manual de privacidad (consentimiento por teléfono/presencial)
export async function marcarPrivacidadManualAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  if (!leadId) return;
  await marcarPrivacidadAceptada(leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.marcar-privacidad", fase: "ok", leadId });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S23.2 — Agrega una nota manual al Contexto del lead
export async function agregarEntradaManualAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nota = (formData.get("nota") as string)?.trim();
  if (!leadId || !nota) return;
  const hdrs = await headers();
  const autor = hdrs.get("x-user-email") ?? "admin";
  await agregarEntradaManualContexto(leadId, nota, autor);
  void logSistema({ categoria: "ui", tipoAccion: "leads.agregar-nota", fase: "ok", leadId, metadata: { autor } });
  revalidatePath(`/admin/leads/${leadId}`);
}

// Mueve un lead dentro de un pipeline específico (multi-pipeline)
export async function moverLeadEnPipelineAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const ruta = formData.get("ruta") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !ruta || !nuevaEtapa) return;
  await moverLeadEnPipeline(leadId, ruta, nuevaEtapa, "admin");
  void logSistema({
    categoria: "ui",
    tipoAccion: "leads.mover-pipeline-multi",
    fase: "ok",
    leadId,
    resultado: `${ruta}:${nuevaEtapa}`,
  });
  revalidatePath(`/admin/leads/${leadId}`);
}

// Admin — Elimina una llamada (pendiente o completada) de un lead
export async function eliminarLlamadaAdminAction(formData: FormData) {
  const llamadaId = formData.get("llamada_id") as string;
  const leadId    = formData.get("leadId")    as string;
  if (!llamadaId || !leadId) return;
  await eliminarLlamada(llamadaId, leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.eliminar-llamada", fase: "ok", leadId, metadata: { llamada_id: llamadaId } });
  revalidatePath(`/admin/leads/${leadId}`);
}

// Admin — Agenda una llamada pendiente para el vendedor asignado al lead
export async function agendarLlamadaAdminAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const objetivo = (formData.get("objetivo") as ObjetivoLlamada) ?? "avance";
  if (!leadId) return;
  await agendarLlamadaAdmin({ leadId, objetivo });
  void logSistema({ categoria: "ui", tipoAccion: "leads.agendar-llamada", fase: "ok", leadId, metadata: { objetivo } });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S4.6 — Pausa o reanuda nurturing desde el perfil del lead
export async function toggleNurturingAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const pausado = formData.get("pausado") === "true";
  if (!leadId) return;
  if (pausado) await reanudarNurturing(leadId);
  else await pausarNurturing(leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.toggle-nurturing", fase: "ok", leadId, metadata: { accion: pausado ? "reanudar" : "pausar" } });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/nurturing");
}

// GHL-5.9 — Aprueba y envía el mensaje GHL sin edición
export const aprobarMensajeGHLAction = safeAction(async (
  itemId: string,
  convId: string,
  ghlContactId: string,
  mensajeIA: string,
  leadEcmaticId: string | null,
  campana: string,
  leadId: string
) => {
  // MPS-19 S72.4 — Double-check: re-verificar ventana WA en tiempo real.
  // El item pudo encolarse dentro de ventana pero el admin tardó >24h en aprobar.
  const VENTANA_WA_MS = 24 * 3_600_000;
  if (leadEcmaticId) {
    const ultimo = await obtenerUltimoEntrante(leadEcmaticId).catch(() => null);
    const fueraDeVentana = !ultimo || (Date.now() - ultimo.getTime() > VENTANA_WA_MS);
    if (fueraDeVentana) {
      // Actualizar el item en cola para que la UI muestre el banner correcto
      const supabase = createServiceClient();
      await (supabase as any)
        .from("ghl_approval_queue")
        .update({ requiere_template: true, razon_score: "⚠️ Ventana WA expiró — enviar template desde GHL" })
        .eq("id", itemId);
      void logSistema({
        categoria: "ui", tipoAccion: "ghl_aprobacion.envio_bloqueado_ventana", fase: "warn",
        leadId, resultado: `item:${itemId} — ventana WA expiró al intentar aprobar`,
      });
      throw new Error("La ventana de 24h de WhatsApp expiró. Envía un template desde GHL y usa 'Marcar como enviado manualmente'.");
    }
  }

  await enviarMensajeGHLFragmentado(convId, mensajeIA, ghlContactId);

  if (leadEcmaticId) {
    await guardarMensaje({ leadId: leadEcmaticId, contenido: mensajeIA, direccion: "saliente" });
  }

  await resolverItemAprobacion({ id: itemId, estado: "aprobado", mensajeFinal: mensajeIA });
  await actualizarStatsAprobacion(campana, "aprobado");

  // Registrar cierre en los recursos KB que generaron esta respuesta
  const supabase = createServiceClient();
  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue").select("contexto, seguimiento_id, template_id").eq("id", itemId).maybeSingle();
  const recursosIds = (qItem?.contexto as Record<string, unknown> | null)?.recursosIds as string[] | undefined;
  if (recursosIds?.length) await registrarCierre(recursosIds).catch(() => null);

  // Alimentar KB si tasa global >= 85% y >= 25 aprobados
  const stats = await obtenerStatsAprobacion(campana);
  if (stats && stats.tasa_limpia >= 0.85 && stats.aprobados >= 25) {
    await crearRecurso(
      "practica_venta",
      `Respuesta SBC aprobada — ${new Date().toLocaleDateString("es-MX")}`,
      `[Campaña ${campana}] Respuesta validada en conversación real\n\n${mensajeIA}`,
      "ia_sugerido"
    ).catch(() => null);
  }

  // MPS-26 S98: promover template Sugerido → Aprobado al aprobar el item
  const templateId = qItem?.template_id as string | null | undefined;
  if (templateId) await promoverTemplate(templateId).catch(() => null);

  // MPS-5 S39.4: avanzarNivel al aprobar (no al encolar)
  const seguimientoId = qItem?.seguimiento_id as string | null | undefined;
  if (seguimientoId) {
    const seg = await obtenerPorId(seguimientoId).catch(() => null);
    if (seg?.estado === "activo") await avanzarNivel(seg).catch(() => null);
  }

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.aprobar", fase: "ok",
    leadId, resultado: `item:${itemId}`,
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/aprobaciones");
});

// GHL-5.9 — Edita el mensaje y lo envía, registrando la razón de la edición
export const editarAprobarMensajeGHLAction = safeAction(async (
  itemId: string,
  convId: string,
  ghlContactId: string,
  textoFinal: string,
  razonEdicion: string,
  leadEcmaticId: string | null,
  campana: string,
  leadId: string
) => {
  await enviarMensajeGHLFragmentado(convId, textoFinal, ghlContactId);

  if (leadEcmaticId) {
    await guardarMensaje({ leadId: leadEcmaticId, contenido: textoFinal, direccion: "saliente" });
  }

  await resolverItemAprobacion({
    id: itemId, estado: "editado",
    mensajeFinal: textoFinal, razonEdicion,
  });
  await actualizarStatsAprobacion(campana, "editado");

  // MPS-20: genera kbi_sugerencia inmediatamente tras cada edición del admin.
  // after() garantiza que sobreviva en Vercel tras retornar el Server Action.
  // No se llama registrarCierre: una respuesta editada no debe inflar score_confianza de los recursos KB.
  after(detectarPatronGHLItem(itemId).catch((e) => void logSistema({
    categoria: "ia", tipoAccion: "kbi.detector.patron_item", fase: "error",
    resultado: e instanceof Error ? e.message : String(e), metadata: { itemId },
  })));

  const supabase = createServiceClient();
  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue").select("contexto, seguimiento_id, template_id").eq("id", itemId).maybeSingle();

  // MPS-26 S98: promover template con el texto editado (regenera embedding async)
  const templateIdEdit = qItem?.template_id as string | null | undefined;
  if (templateIdEdit) await promoverTemplate(templateIdEdit, textoFinal).catch(() => null);

  // MPS-5 S39.4: avanzarNivel al editar/aprobar (no al encolar)
  const seguimientoId = qItem?.seguimiento_id as string | null | undefined;
  if (seguimientoId) {
    const seg = await obtenerPorId(seguimientoId).catch(() => null);
    if (seg?.estado === "activo") await avanzarNivel(seg).catch(() => null);
  }

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.editar", fase: "ok",
    leadId, resultado: `item:${itemId}`, metadata: { razonEdicion: razonEdicion.slice(0, 100) },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/aprobaciones");
});

// MPS-19 S72.4 — El admin envió el template manualmente desde GHL; cierra el loop en ECMatic.
// No llama a GHL (el admin ya envió), solo registra el resultado y avanza el nivel.
export const marcarEnviadoManualmenteGHLAction = safeAction(async (
  itemId: string,
  campana: string,
  leadId: string
) => {
  await resolverItemAprobacion({
    id: itemId,
    estado: "aprobado",
    mensajeFinal: "(enviado manualmente vía template GHL)",
  });
  await actualizarStatsAprobacion(campana, "aprobado");

  const supabase = createServiceClient();
  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue").select("seguimiento_id").eq("id", itemId).maybeSingle();
  const seguimientoId = qItem?.seguimiento_id as string | null | undefined;
  if (seguimientoId) {
    const seg = await obtenerPorId(seguimientoId).catch(() => null);
    if (seg?.estado === "activo") await avanzarNivel(seg).catch(() => null);
  }

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.enviado_template_manual", fase: "ok",
    leadId, resultado: `item:${itemId}`,
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/aprobaciones");
});

// S107 — Rechaza el mensaje desde la ficha del lead.
// Para seguimientos: pospone 4h en el mismo nivel (no consume intento) y elimina el template sugerido.
// Para items de campaña sin seguimiento: solo rechaza sin efecto en seguimiento.
export const rechazarMensajeGHLAction = safeAction(async (
  itemId: string,
  campana: string,
  leadId: string
) => {
  const supabase = createServiceClient();
  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue").select("seguimiento_id, template_id").eq("id", itemId).maybeSingle();

  await resolverItemAprobacion({ id: itemId, estado: "rechazado" });
  await actualizarStatsAprobacion(campana, "rechazado");

  const seguimientoId = qItem?.seguimiento_id as string | null | undefined;
  const templateId    = qItem?.template_id    as string | null | undefined;

  if (seguimientoId) {
    // Posponer 4h sin avanzar nivel — el admin dice "no ahora", no "este mensaje no sirve"
    await posponerSeguimiento4h(seguimientoId).catch(() => null);
  }

  if (templateId) {
    // Eliminar el template si aún es sugerido — no fue validado por el admin
    await eliminarTemplateSiSugerido(templateId).catch(() => null);
  }

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.posponer_4h", fase: "ok",
    leadId, resultado: `item:${itemId}`,
    metadata: { seguimiento_id: seguimientoId ?? null, template_id: templateId ?? null },
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/aprobaciones");
});

// MPS-31 S113.2 — Genera lazily el mensaje IA para un item pendiente en cola.
// Se llama desde BannerAprobacionGHL cuando mensaje_ia === "".
// Idempotente: si el mensaje ya fue generado, retorna el valor existente.
export const generarMensajeColaAction = safeAction(async (
  itemId: string,
): Promise<{ texto: string }> => {
  const supabase = createServiceClient();

  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("mensaje_ia, seguimiento_id, lead_ecmatic_id, requiere_template")
    .eq("id", itemId)
    .eq("estado", "pendiente")
    .maybeSingle() as {
      data: {
        mensaje_ia: string;
        seguimiento_id: string | null;
        lead_ecmatic_id: string | null;
        requiere_template: boolean;
      } | null;
    };

  if (!qItem) throw new Error("Item no encontrado o ya procesado");

  // Idempotente: ya fue generado por una llamada concurrente
  if (qItem.mensaje_ia) return { texto: qItem.mensaje_ia };

  const leadId = qItem.lead_ecmatic_id;
  if (!leadId || !qItem.seguimiento_id) {
    throw new Error("Item sin contexto de seguimiento — no se puede generar");
  }

  const { data: seg } = await (supabase as any)
    .from("seguimiento_lead")
    .select("tipo, nivel, gatillo_snapshot, horario_prometido")
    .eq("id", qItem.seguimiento_id)
    .maybeSingle() as {
      data: {
        tipo: string;
        nivel: number;
        gatillo_snapshot: string | null;
        horario_prometido: string | null;
      } | null;
    };

  if (!seg) throw new Error("Seguimiento no encontrado");

  const nivel = seg.nivel + 1;

  const config = await getFollowupConfig(seg.tipo as never).catch(() => null);
  const historialLimite = config?.historial_limite ?? 10;

  const [nombre, links, historialRaw] = await Promise.all([
    obtenerNombreLead(leadId),
    seg.tipo === "payment"
      ? obtenerLinksLead(leadId).catch(() => ({ linkPago: null, linkApartado: null }))
      : Promise.resolve({ linkPago: null, linkApartado: null }),
    obtenerHistorial(leadId, historialLimite).catch(() => ""),
  ]);

  const historialResumen = historialRaw || null;
  const labelContexto = `Recordatorio ${seg.tipo} · nivel ${nivel}${seg.gatillo_snapshot ? ` · ${seg.gatillo_snapshot}` : ""}`;

  // Cascade fresco — usa los templates vigentes en este momento
  const cascade = await buscarTemplateCascada({
    leadId,
    tipo: seg.tipo as never,
    historialResumen,
  }).catch(() => null);

  let texto: string;
  let templateId: string | null = null;
  let scoreIA: number;
  let razonScore: string;

  if (cascade && (cascade.estado === "aprobado" || cascade.estado === "sugerido")) {
    texto      = cascade.template.texto;
    templateId = cascade.template.id;
    scoreIA    = 0.85;
    razonScore = `Template ${cascade.estado} reutilizado — ${labelContexto}`;
  } else {
    const angulo = await seleccionarAngulo({
      tipo:   seg.tipo as never,
      nivel,
      leadId,
    }).catch(() => null);

    if (!angulo) throw new Error("No hay ángulos disponibles para este tipo de seguimiento");

    const horarioPrometido = seg.horario_prometido
      ? new Date(seg.horario_prometido).toLocaleTimeString("es-MX", {
          hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City",
        })
      : null;

    texto = await generarFollowupGHL(
      {
        nombre,
        tipo:            seg.tipo as never,
        nivel,
        angulo,
        horarioPrometido,
        gatilloSnapshot: seg.gatillo_snapshot,
        historial:       historialResumen,
        ...links,
      },
      { leadId, traceId: itemId },
    );

    if (!texto) throw new Error("La IA no generó un mensaje");

    templateId = await guardarTemplateSugerido({
      tipo:     seg.tipo as never,
      anguloId: angulo.id,
      texto,
    }).catch(() => null);

    scoreIA    = 0.75;
    razonScore = `Generado por IA (ángulo: ${angulo.nombre}) — ${labelContexto}`;
  }

  await (supabase as any)
    .from("ghl_approval_queue")
    .update({
      mensaje_ia:  texto,
      template_id: templateId,
      score_ia:    scoreIA,
      razon_score: razonScore,
    })
    .eq("id", itemId);

  if (templateId && cascade) {
    void registrarUsoTemplate(templateId, leadId, qItem.seguimiento_id).catch(() => null);
  }

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.generar_lazy", fase: "ok",
    leadId,
    resultado: `item:${itemId} cascade:${cascade?.estado ?? "nuevo"} template:${templateId?.slice(-8) ?? "none"}`,
    metadata:  { seguimiento_id: qItem.seguimiento_id, tipo: seg.tipo, nivel },
  });

  return { texto };
});

// MPS-31 — Genera una respuesta personalizada basada en la conversación real.
// No usa ángulos ni templates. No crea template nuevo. Almacena en mensaje_ia para persistencia.
export const generarRespuestaPersonalizadaAction = safeAction(async (
  itemId: string,
): Promise<{ texto: string }> => {
  const supabase = createServiceClient();

  const { data: qItem } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("mensaje_ia, seguimiento_id, lead_ecmatic_id")
    .eq("id", itemId)
    .eq("estado", "pendiente")
    .maybeSingle() as {
      data: { mensaje_ia: string; seguimiento_id: string | null; lead_ecmatic_id: string | null } | null;
    };

  if (!qItem) throw new Error("Item no encontrado o ya procesado");
  if (qItem.mensaje_ia) return { texto: qItem.mensaje_ia };

  const leadId = qItem.lead_ecmatic_id;
  if (!leadId || !qItem.seguimiento_id) throw new Error("Item sin contexto de seguimiento");

  const { data: seg } = await (supabase as any)
    .from("seguimiento_lead")
    .select("tipo, nivel, gatillo_snapshot, horario_prometido")
    .eq("id", qItem.seguimiento_id)
    .maybeSingle() as {
      data: { tipo: string; nivel: number; gatillo_snapshot: string | null; horario_prometido: string | null } | null;
    };

  if (!seg) throw new Error("Seguimiento no encontrado");

  const nivel = seg.nivel + 1;
  const config = await getFollowupConfig(seg.tipo as never).catch(() => null);

  const [nombre, links, historialRaw] = await Promise.all([
    obtenerNombreLead(leadId),
    seg.tipo === "payment"
      ? obtenerLinksLead(leadId).catch(() => ({ linkPago: null, linkApartado: null }))
      : Promise.resolve({ linkPago: null, linkApartado: null }),
    // Historial más amplio para mejor contexto conversacional
    obtenerHistorial(leadId, Math.min((config?.historial_limite ?? 10) + 5, 20)).catch(() => ""),
  ]);

  const texto = await generarRespuestaConversacional(
    {
      nombre,
      tipo:            seg.tipo as never,
      nivel,
      historial:       historialRaw || null,
      gatilloSnapshot: seg.gatillo_snapshot,
      ...links,
    },
    { leadId, traceId: itemId },
  );

  if (!texto) throw new Error("La IA no generó un mensaje");

  const labelContexto = `Recordatorio ${seg.tipo} · nivel ${nivel}${seg.gatillo_snapshot ? ` · ${seg.gatillo_snapshot}` : ""}`;

  await (supabase as any)
    .from("ghl_approval_queue")
    .update({
      mensaje_ia:  texto,
      template_id: null,
      score_ia:    0.80,
      razon_score: `✏️ Respuesta personalizada — ${labelContexto}`,
    })
    .eq("id", itemId);

  void logSistema({
    categoria: "ui", tipoAccion: "ghl_aprobacion.generar_personalizada", fase: "ok",
    leadId,
    resultado: `item:${itemId}`,
    metadata:  { seguimiento_id: qItem.seguimiento_id, tipo: seg.tipo, nivel },
  });

  return { texto };
});
