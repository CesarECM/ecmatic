import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { agregarTagsContacto, obtenerContacto } from "@/lib/ghl/contacts-api";
import { buscarConversacionWA, obtenerOCrearConversacionWA, obtenerMensajes, enviarMensajeGHLFragmentado } from "@/lib/ghl/conversations-api";
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
import { crearSeguimiento, marcarCompletado, obtenerActivo, cancelarPorTipo } from "@/services/seguimiento-lead";

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
    metadata:  { contactId, conversationId, tiene_cuerpo: !!cuerpo },
  });

  if (!cuerpo) {
    void logSistema({
      categoria: "webhook", tipoAccion: "ghl_sbc.cuerpo_vacio", fase: "warn",
      resultado: "sin cuerpo en payload ni inbound en GHL — procesamiento abortado",
      metadata:  { contactId, conversationId, payload_keys: Object.keys(payload) },
    });
    return;
  }

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
    metadata:  { contactId, campana: CAMPANA_ACTIVA, respuesta_tipo: log?.respuesta_tipo ?? null, enviado: log?.enviado ?? null },
  });

  if (!log?.enviado) return;

  // Contacto ya blacklisteado en turno previo — ignorar
  if (log.respuesta_tipo === "negativo") {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.blacklist", fase: "ok", resultado: "ignorado", metadata: { contactId } });
    return;
  }

  const convId = conversationId || await obtenerOCrearConversacionWA(contactId).catch(() => null);

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.convid", fase: convId ? "ok" : "warn",
    resultado: convId ? `convId resuelto (${convId.slice(-8)})` : "convId no disponible",
    metadata:  { contactId, desde_payload: !!conversationId, conv_encontrado: !!convId },
  });

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
    void logSistema({
      categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error",
      resultado: "sin convId tras obtenerOCrear — notificando admin para revisión manual",
      metadata:  { contactId, conversationId_en_payload: conversationId ?? null },
    });
    void notificarMensajePendienteGHL({
      itemId:      "sin-conv",
      convId:      contactId,
      contactId,
      nombre:      null,
      mensajeLead: cuerpo.slice(0, 200),
      scoreIA:     0,
      urgencia:    3,
    });
    return;
  }

  await logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "inicio", resultado: cuerpo.slice(0, 80) });

  let resultado: Awaited<ReturnType<typeof generarRespuestaMotorCompleto>> = null;
  try {
    resultado = await generarRespuestaMotorCompleto(contactId, cuerpo);
  } catch (e) {
    await logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "error", resultado: `throw: ${String(e).slice(0, 200)}` });
    return;
  }

  await logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: resultado ? "ok" : "warn",
    resultado: resultado ? resultado.texto.slice(0, 120) : "resultado null — ver ghl_sbc.motor",
  });

  if (!resultado) return;

  const { texto, leadId, intencion, setterFaseActual, nombre, recursosIds, nuevoModo, citaFin } = resultado;

  // GHL-9: si el lead tiene seguimiento de pago activo, detectar si está enviando comprobante
  void (async () => {
    const seg = await obtenerActivo(leadId).catch(() => null);
    if (seg?.tipo === "payment") {
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

  const contextoItem = { intencion, setter_fase: setterFaseActual, conv_id: convId, recursosIds };

  if (pasaUmbral) {
    // Score suficiente — intentar enviar directo sin revisión humana
    let enviado = false;
    try {
      await enviarMensajeGHLFragmentado(convId, texto, contactId);
      enviado = true;
      void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "ok", resultado: `auto conv:${convId}` });
    } catch (e) {
      void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error", resultado: String(e) });
    }

    // Invariante: si el envío directo falló, encolar para que siempre llegue al admin o al lead
    if (!enviado) {
      await encolarYNotificar(contactId, convId, leadId, cuerpo, texto, score, `[auto-send falló] ${razon}`, contextoItem, 1);
    }
  } else {
    // Modo supervisado: encolar para aprobación — siempre notificar al admin
    await encolarYNotificar(contactId, convId, leadId, cuerpo, texto, score, razon, contextoItem, 0);
  }

  // Seguimiento de pago solo cuando el lead manifiesta intención explícita de compra inmediata.
  // compra_inmediata = "¿cómo pago?", "quiero inscribirme" — el motor envía el link en esa respuesta.
  // NO usar modo_revelacion: revelar el servicio no equivale a querer pagar.
  if (intencion === "compra_inmediata") {
    void cancelarPorTipo(leadId, "demo_agendado"); // si tenía demo, ya decidió pagar
    void crearSeguimiento({ leadId, tipo: "payment", ghlContactId: contactId, convId, campana: CAMPANA_ACTIVA });
  }

  // Cuando el lead confirmó un slot, programar el primer follow-up a partir del fin de la reunión.
  // floorOverride=citaFin garantiza que el motor bayesiano no programe antes de que la sesión termine.
  if (citaFin) {
    void cancelarPorTipo(leadId, "nurturing");
    void cancelarPorTipo(leadId, "conversational");
    void crearSeguimiento({ leadId, tipo: "demo_agendado", ghlContactId: contactId, convId, campana: CAMPANA_ACTIVA, floorOverride: citaFin });
  }
}

// Garantiza la invariante: siempre llega el mensaje al lead O la notificación al admin
async function encolarYNotificar(
  contactId: string,
  convId: string,
  leadId: string,
  mensajeLead: string,
  mensajeIA: string,
  score: number,
  razon: string,
  contexto: Record<string, unknown>,
  urgencia: number,
): Promise<void> {
  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.cola", fase: "inicio",
    resultado: `encolarYNotificar invocado urgencia:${urgencia} score:${score.toFixed(2)}`,
    metadata:  { contactId, leadId, razon: razon.slice(0, 120) },
  });

  const itemId = await encolarMensajeGHL({
    campana: CAMPANA_ACTIVA, ghlContactId: contactId, convId, leadEcmaticId: leadId,
    mensajeLead, mensajeIA, contexto, scoreIA: score, razonScore: razon,
  });

  const nombre = await obtenerContacto(contactId)
    .then((c) => c.name ?? c.firstName ?? null)
    .catch(() => null);

  // Notificar siempre: si encolar falló, itemId es null → se pasa "error" como fallback
  // El admin recibe la alerta y puede revisar /admin/aprobaciones
  await notificarMensajePendienteGHL({
    itemId: itemId ?? "error", convId, contactId, nombre,
    mensajeLead, scoreIA: score, leadEcmaticId: leadId, urgencia,
  });

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.cola",
    fase: itemId ? "ok" : "error",
    resultado: itemId
      ? `item:${itemId} score:${score.toFixed(2)} notif:enviada`
      : `encolar falló — notif directa urgencia:${urgencia}`,
    metadata: { contactId, itemId },
  });
}

interface ResultadoMotor {
  texto: string;
  leadId: string;
  intencion: string;
  setterFaseActual: number;
  nombre: string | null;
  recursosIds: string[];
  nuevoModo: ModoRevelacion;
  citaFin?: Date; // presente solo cuando el lead confirmó un slot en este turno
}

async function generarRespuestaMotorCompleto(
  contactId: string,
  cuerpo: string
): Promise<ResultadoMotor | null> {
  const supabase = createServiceClient();
  const telefono = `ghl_${contactId}`;

  let nombre: string | null = null;
  let tagsGHL: string[] = [];
  try {
    const c = await obtenerContacto(contactId);
    nombre  = (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null;
    tagsGHL = c.tags ?? [];
  } catch { /* usar null */ }

  // Ruta del pipeline SBC — garantiza que el motor inyecte la ficha del servicio
  const SBC_PIPELINE_RUTA = process.env.GHL_SBC_PIPELINE_RUTA ?? "smartbuilder_vd_wa_mqqau2nj";

  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(
      {
        telefono,
        canal_origen:  "whatsapp",
        privacidad_aceptada: true,
        ...(nombre && { nombre }),
      },
      { onConflict: "telefono" }
    )
    .select("id, nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa, setter_fase_actual, setter_calificado, modo_revelacion")
    .single();

  if (error || !lead) {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.motor", fase: "error", resultado: `upsert lead fallido: ${error?.message ?? "null lead"}`, metadata: { telefono } });
    return null;
  }

  void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.motor", fase: "inicio", resultado: `lead:${lead.id.slice(0,8)} ruta:${lead.pipeline_ruta ?? "null"}`, metadata: { leadId: lead.id } });

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
  let citaFin: Date | undefined;
  if (intencion === "confirmando_slot") {
    const demoResult = await confirmarSlotDemo(lead.id, cuerpo).catch(() => null);
    meetLinkDemo = demoResult?.meetLink ?? null;
    citaFin = demoResult?.citaFin;
  } else {
    const slots = await dispararDemoSbc(lead.id, intencion, historial, nuevoModo).catch(() => null);
    if (slots?.length) slotsDemo = slots;
  }

  // pipeline_ruta efectiva: la del lead si ya fue asignada a algo específico, si no la SBC
  const pipelineRutaEfectiva = (lead.pipeline_ruta && lead.pipeline_ruta !== "tripwire" && lead.pipeline_ruta !== "premium")
    ? lead.pipeline_ruta
    : SBC_PIPELINE_RUTA;

  const etiquetasMotor = [
    ...etiquetasLead.map((e) => `${e.categoria}:${e.nombre}`),
    ...tagsGHL.map((t) => `ghl:${t}`),
  ];

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.motor", fase: "llamado",
    resultado: `intencion:${intencion} slots:${slotsDemo?.length ?? 0} meetLink:${!!meetLinkDemo} ruta:${pipelineRutaEfectiva}`,
    leadId: lead.id,
  });

  let texto: string;
  let recursosIds: string[];
  try {
    ({ texto, recursosIds } = await generarRespuesta([cuerpo], {
      nombre:        nombre ?? lead.nombre ?? null,
      temperamento:  lead.temperamento_inferido ?? null,
      pipelineStage: lead.pipeline_stage ?? "Nuevo",
      compraPreviaa: lead.compra_previa ?? false,
      historial,
      pipelineRuta:  pipelineRutaEfectiva as import("@/lib/supabase/types").PipelineRuta,
      faseCAGC:      estadoCagc?.fase_numero,
      etiquetas:     etiquetasMotor,
      canal_origen:  "whatsapp",
      setterEstado,
      protocoloObjecion,
      rolesDinamicos,
      modoRevelacion: nuevoModo,
      leadId:        lead.id,
      ...(slotsDemo?.length && { slotsDisponibles: slotsDemo }),
      ...(meetLinkDemo && { meetLink: meetLinkDemo }),
    }));
  } catch (e) {
    void logSistema({
      categoria: "webhook", tipoAccion: "ghl_sbc.motor", fase: "error",
      resultado: `generarRespuesta throw: ${String(e).slice(0, 300)}`,
      leadId: lead.id,
    });
    return null;
  }

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.motor", fase: "ok",
    resultado: texto.slice(0, 120),
    leadId: lead.id,
  });

  // El mensaje saliente se guarda solo cuando se aprueba/envía, no aquí
  return { texto, leadId: lead.id, intencion, setterFaseActual, nombre, recursosIds, nuevoModo, citaFin };
}
