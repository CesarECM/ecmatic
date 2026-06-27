import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { agregarTagsContacto, obtenerContacto } from "@/lib/ghl/contacts-api";
import { buscarConversacionWA, obtenerMensajes, enviarMensajeGHL } from "@/lib/ghl/conversations-api";
import { registrarRespuestaGHL } from "@/services/ab-workflows-ghl";
import { generarRespuesta } from "@/lib/ai/motor-respuesta";
import { guardarMensaje, obtenerHistorial } from "@/services/mensajes";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { obtenerFaseLead } from "@/services/cagc";
import { obtenerEtiquetasLead } from "@/services/etiquetas";
import { evaluarFaseSetter } from "@/lib/ai/setter-protocol";
import { detectarRevelacion, calcularNuevoModo, type ModoRevelacion } from "@/lib/ai/detector-revelacion";
import { filtrarResistencia } from "@/lib/ai/filtro-objecion";
import { identificarDesconfianza } from "@/lib/ai/tres-desconfianzas";
import { construirProtocoloObjecion } from "@/lib/ai/protocolo-objecion";
import { obtenerRolDinamico } from "@/services/rol-dinamico";
import { evaluarScoreMensajeGHL } from "@/lib/ai/evaluar-score-ghl";
import { encolarMensajeGHL, obtenerUmbralAuto } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL } from "@/services/ghl-aprobacion-notif";
import { actualizarTagsYPipeline } from "@/services/ghl-tagging-progresivo";
import { dispararDemoSbc, confirmarSlotDemo } from "@/services/ghl-demo-sbc";
import { detectarEstadoPago } from "@/lib/ai/detectar-estado-pago";
import { crearSeguimiento, marcarCompletado, obtenerActivo } from "@/services/seguimiento-lead";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

const TEXTOS_NEGATIVOS = [
  "ya no me interesa", "no me interesa", "no quiero",
  "cancelar", "dar de baja", "stop", "no gracias",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function procesarMensajeEntranteSBC(payload: any): Promise<void> {
  const contactId      = payload.contactId as string | undefined;
  const conversationId = payload.conversationId as string | undefined;

  let cuerpo = ((payload.body ?? payload.message ?? payload.text ?? "") as string).trim();

  if (!contactId) {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.recibido", fase: "error", resultado: "sin contactId" });
    return;
  }

  if (!cuerpo) {
    try {
      const conv = await buscarConversacionWA(contactId);
      if (conv) {
        const mensajes = await obtenerMensajes(conv.id, 5);
        const ultimo = mensajes.find((m) => m.direction === "inbound");
        cuerpo = (ultimo?.body ?? ultimo?.text ?? "").trim();
      }
    } catch { /* cuerpo queda vacío */ }
  }

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.recibido", fase: "inicio",
    resultado: cuerpo.slice(0, 80) || "(sin cuerpo)",
    metadata:  { contactId, conversationId },
  });

  if (!cuerpo) return;

  const supabase = createServiceClient();
  const { data: log } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("id, variante, enviado, respuesta_tipo")
    .eq("ghl_contact_id", contactId)
    .eq("campana", CAMPANA_ACTIVA)
    .maybeSingle() as { data: { id: string; variante: "a" | "b"; enviado: boolean; respuesta_tipo: string | null } | null };

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.lookup", fase: log?.enviado ? "ok" : "error",
    resultado: log ? (log.enviado ? "en campaña" : "no enviado") : "no encontrado",
    metadata:  { contactId, campana: CAMPANA_ACTIVA },
  });

  if (!log?.enviado) return;

  // Contacto ya blacklisteado en turno previo — ignorar
  if (log.respuesta_tipo === "negativo") {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.blacklist", fase: "ok", resultado: "ignorado", metadata: { contactId } });
    return;
  }

  const convId = conversationId || (await buscarConversacionWA(contactId).catch(() => null))?.id;

  const esNegativo = TEXTOS_NEGATIVOS.some((t) => cuerpo.toLowerCase().includes(t));

  if (esNegativo) {
    // Solo etiquetar — sin responder para no ciclar la IA
    await agregarTagsContacto(contactId, ["est_blacklist", "est_perdido_interes"]).catch(() => null);
    await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, "negativo");
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.negativo", fase: "ok", resultado: "blacklist aplicado", metadata: { contactId } });
    return;
  }

  await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, "positivo");

  if (!convId) {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error", resultado: "sin convId" });
    return;
  }

  void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "inicio", resultado: cuerpo.slice(0, 80) });

  const resultado = await generarRespuestaMotorCompleto(contactId, cuerpo).catch((e) => {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "error", resultado: String(e) });
    return null;
  });

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: resultado ? "ok" : "error",
    resultado: resultado?.texto.slice(0, 120) ?? "null",
  });

  if (!resultado) return;

  const { texto, leadId, intencion, setterFaseActual, nombre, recursosIds, nuevoModo } = resultado;

  // GHL-9: si el lead tiene seguimiento de pago activo, detectar si está enviando comprobante
  void (async () => {
    const seg = await obtenerActivo(leadId).catch(() => null);
    if (seg?.tipo === "pago_pendiente") {
      const deteccion = await detectarEstadoPago(cuerpo, { leadId }).catch(() => null);
      if (deteccion?.estado === "comprobante") {
        await marcarCompletado(leadId).catch(() => null);
        void logSistema({
          categoria: "webhook", tipoAccion: "ghl_sbc.pago_completado", fase: "ok",
          resultado: "comprobante detectado — seguimiento cerrado",
          metadata:  { contactId, leadId },
        });
      }
    }
  })();

  // GHL-6: tagging progresivo + pipeline — corre en background sin bloquear la respuesta
  void actualizarTagsYPipeline(contactId, cuerpo, intencion, nombre);

  // Evaluar score del mensaje generado
  const { score, razon } = await evaluarScoreMensajeGHL(cuerpo, texto, contactId).catch(() => ({ score: 0.5, razon: "Error evaluando" }));

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.score", fase: "ok",
    resultado: `score:${score.toFixed(2)}`,
    metadata:  { contactId, score, razon },
  });

  const umbralAuto = await obtenerUmbralAuto(CAMPANA_ACTIVA);
  const pasaUmbral = score >= umbralAuto;

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.umbral", fase: "ok",
    resultado: `score:${score.toFixed(2)} umbral:${umbralAuto.toFixed(2)} auto:${pasaUmbral}`,
    metadata: { contactId },
  });

  if (pasaUmbral) {
    // Score suficiente — enviar directo sin revisión humana
    await enviarMensajeGHL(convId, texto, contactId).catch((e) =>
      void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error", resultado: String(e) })
    );
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "ok", resultado: `auto conv:${convId}` });

    // GHL-9: crear seguimiento de pago si la IA acaba de revelar precio/pago
    if (nuevoModo === "revelado") {
      void crearSeguimiento({
        leadId, tipo: "pago_pendiente",
        ghlContactId: contactId, convId, campana: CAMPANA_ACTIVA,
      });
    }
  } else {
    // Modo supervisado: encolar para aprobación
    const contexto = {
      intencion,
      setter_fase: setterFaseActual,
      conv_id: convId,
      recursosIds,
    };

    const itemId = await encolarMensajeGHL({
      campana:       CAMPANA_ACTIVA,
      ghlContactId:  contactId,
      convId,
      leadEcmaticId: leadId,
      mensajeLead:   cuerpo,
      mensajeIA:     texto,
      contexto,
      scoreIA:       score,
      razonScore:    razon,
    });

    if (itemId) {
      const nombreContacto = await obtenerContacto(contactId)
        .then((c) => c.name ?? c.firstName ?? null)
        .catch(() => null);

      void notificarMensajePendienteGHL({
        itemId,
        convId,
        contactId,
        nombre: nombreContacto,
        mensajeLead: cuerpo,
        scoreIA: score,
        leadEcmaticId: leadId,
      });

      void logSistema({
        categoria: "webhook", tipoAccion: "ghl_sbc.cola", fase: "ok",
        resultado: `item:${itemId} score:${score.toFixed(2)}`,
        metadata:  { contactId, itemId },
      });
    }

    // GHL-9: crear seguimiento de pago si la IA acaba de revelar precio/pago (modo supervisado)
    if (nuevoModo === "revelado") {
      void crearSeguimiento({
        leadId, tipo: "pago_pendiente",
        ghlContactId: contactId, convId, campana: CAMPANA_ACTIVA,
      });
    }
  }
}

interface ResultadoMotor {
  texto: string;
  leadId: string;
  intencion: string;
  setterFaseActual: number;
  nombre: string | null;
  recursosIds: string[];
  nuevoModo: ModoRevelacion;
}

async function generarRespuestaMotorCompleto(
  contactId: string,
  cuerpo: string
): Promise<ResultadoMotor | null> {
  const supabase = createServiceClient();
  const telefono = `ghl_${contactId}`;

  let nombre: string | null = null;
  try {
    const c = await obtenerContacto(contactId);
    nombre = (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null;
  } catch { /* usar null */ }

  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(
      { telefono, canal_origen: "whatsapp", privacidad_aceptada: true, ...(nombre && { nombre }) },
      { onConflict: "telefono" }
    )
    .select("id, nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa, setter_fase_actual, setter_calificado, modo_revelacion")
    .single();

  if (error || !lead) return null;

  const historial     = await obtenerHistorial(lead.id);
  const intencion     = await clasificarIntencion([cuerpo], historial).catch(() => "fuera_de_contexto" as const);
  await guardarMensaje({ leadId: lead.id, contenido: cuerpo, direccion: "entrante", intencion });

  const setterFaseActual    = (lead.setter_fase_actual as number | null) ?? 1;
  const setterCalificado    = (lead.setter_calificado as boolean | null) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modoRevelacionActual = (((lead as any).modo_revelacion) ?? "oculto") as ModoRevelacion;
  const esObjecion           = intencion === "objecion_precio" || intencion === "objecion_confianza";
  const setterActivo         = setterCalificado === null;

  const [estadoCagc, etiquetasLead, setterEstado, filtroResult, rolesDinamicos, señalRevelacion] = await Promise.all([
    obtenerFaseLead(lead.id).catch(() => null),
    obtenerEtiquetasLead(lead.id).catch(() => [] as Array<{ categoria: string; nombre: string }>),
    setterActivo && historial
      ? evaluarFaseSetter(setterFaseActual, [cuerpo], historial, lead.temperamento_inferido ?? null).catch(() => null)
      : Promise.resolve(null),
    esObjecion ? filtrarResistencia([cuerpo], historial).catch(() => null) : Promise.resolve(null),
    obtenerRolDinamico(lead.id).catch(() => []),
    modoRevelacionActual !== "revelado"
      ? detectarRevelacion([cuerpo], historial, modoRevelacionActual, { leadId: lead.id }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const nuevoModo = calcularNuevoModo(modoRevelacionActual, señalRevelacion);
  if (nuevoModo !== modoRevelacionActual)
    void (async () => { await supabase.from("leads").update({ modo_revelacion: nuevoModo }).eq("id", lead.id); })().catch(() => {});

  if (setterEstado?.debeAvanzar && setterEstado.faseNueva !== setterFaseActual)
    void (async () => { await supabase.from("leads").update({ setter_fase_actual: setterEstado!.faseNueva }).eq("id", lead.id); })().catch(() => {});

  let protocoloObjecion = null;
  if (filtroResult) {
    const desconfianza = filtroResult.tipo === "objecion"
      ? await identificarDesconfianza([cuerpo], historial).catch(() => null)
      : null;
    protocoloObjecion = construirProtocoloObjecion(filtroResult.tipo, desconfianza?.tipo ?? null);
  }

  // Demo automática SBC: slots para nuevo turno o meetLink para confirmación
  let slotsDemo: import("@/services/citas").SlotDisponible[] | undefined;
  let meetLinkDemo: string | null | undefined;
  if (intencion === "confirmando_slot") {
    meetLinkDemo = await confirmarSlotDemo(lead.id, cuerpo).catch(() => null);
  } else {
    const slots = await dispararDemoSbc(lead.id, intencion, historial, nuevoModo).catch(() => null);
    if (slots?.length) slotsDemo = slots;
  }

  const { texto, recursosIds } = await generarRespuesta([cuerpo], {
    nombre:        nombre ?? lead.nombre ?? null,
    temperamento:  lead.temperamento_inferido ?? null,
    pipelineStage: lead.pipeline_stage ?? "Nuevo",
    compraPreviaa: lead.compra_previa ?? false,
    historial,
    pipelineRuta:  lead.pipeline_ruta ?? "tripwire",
    faseCAGC:      estadoCagc?.fase_numero,
    etiquetas:     etiquetasLead.map((e) => `${e.categoria}:${e.nombre}`),
    canal_origen:  "whatsapp",
    setterEstado,
    protocoloObjecion,
    rolesDinamicos,
    modoRevelacion: nuevoModo,
    ...(slotsDemo?.length && { slotsDisponibles: slotsDemo }),
    ...(meetLinkDemo && { meetLink: meetLinkDemo }),
  });

  // El mensaje saliente se guarda solo cuando se aprueba/envía, no aquí
  return { texto, leadId: lead.id, intencion, setterFaseActual, nombre, recursosIds, nuevoModo };
}
