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

const CAMPANA_ACTIVA = "sbc_jun26";

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
    .select("id, variante, enviado")
    .eq("ghl_contact_id", contactId)
    .eq("campana", CAMPANA_ACTIVA)
    .maybeSingle() as { data: { id: string; variante: "a" | "b"; enviado: boolean } | null };

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.lookup", fase: log?.enviado ? "ok" : "error",
    resultado: log ? (log.enviado ? "en campaña" : "no enviado") : "no encontrado",
    metadata:  { contactId, campana: CAMPANA_ACTIVA },
  });

  if (!log?.enviado) return;

  const convId = conversationId || (await buscarConversacionWA(contactId).catch(() => null))?.id;

  const esNegativo = TEXTOS_NEGATIVOS.some((t) => cuerpo.toLowerCase().includes(t));

  if (esNegativo) {
    await agregarTagsContacto(contactId, ["ecm_blacklist", "ecm_sbc_descartado"]).catch(() => null);
    await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, "negativo");
    if (convId) {
      await enviarMensajeGHL(convId,
        "Entendido, no hay problema. Si en algún momento reconsideras tu certificación EC0217.01, aquí estaremos. Que te vaya muy bien.",
        contactId
      ).catch(() => null);
    }
    return;
  }

  await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, "positivo");

  if (!convId) {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error", resultado: "sin convId" });
    return;
  }

  void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "inicio", resultado: cuerpo.slice(0, 80) });

  const respuesta = await generarRespuestaMotorCompleto(contactId, cuerpo).catch((e) => {
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: "error", resultado: String(e) });
    return null;
  });

  void logSistema({
    categoria: "webhook", tipoAccion: "ghl_sbc.generar", fase: respuesta ? "ok" : "error",
    resultado: respuesta?.slice(0, 120) ?? "null",
  });

  if (respuesta) {
    await enviarMensajeGHL(convId, respuesta, contactId).catch((e) =>
      void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "error", resultado: String(e) })
    );
    void logSistema({ categoria: "webhook", tipoAccion: "ghl_sbc.enviar", fase: "ok", resultado: `conv:${convId}` });
  }
}

async function generarRespuestaMotorCompleto(contactId: string, cuerpo: string): Promise<string | null> {
  const supabase = createServiceClient();
  const telefono = `ghl_${contactId}`;

  // Nombre del contacto desde GHL
  let nombre: string | null = null;
  try {
    const c = await obtenerContacto(contactId);
    nombre = (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) || null;
  } catch { /* usar null */ }

  // Crear o encontrar lead ECMatic para este contacto GHL
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

  const { texto } = await generarRespuesta([cuerpo], {
    nombre:       nombre ?? lead.nombre ?? null,
    temperamento: lead.temperamento_inferido ?? null,
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
  });

  await guardarMensaje({ leadId: lead.id, contenido: texto, direccion: "saliente" });

  return texto;
}
