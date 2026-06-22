import { obtenerOCrearLead, inferirEtapaPipeline, inferirTemperamento } from "./leads";
import { guardarMensaje, obtenerHistorial } from "./mensajes";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { generarRespuesta, necesitaHandoff } from "@/lib/ai/motor-respuesta";
import { enviarRespuestaWhatsApp } from "./whatsapp-sender";
import { crearTicketHandoff } from "./tickets";
import { generarLinkStripe } from "./pagos";
import { detectarAceptacion, marcarPrivacidadAceptada, mensajeAvisoPrivacidad } from "./privacidad";
import { obtenerFaseLead } from "./cagc";
import { generarSolicitudDatosFaltantes } from "./limpieza-leads";
import { obtenerEtiquetasLead } from "./etiquetas";
import { obtenerConfig } from "./sistema";
import { encolarRespuesta } from "./mensajes-aprobacion";
import { capturarContactoPasivo } from "./captura-contacto";
import { obtenerSlotsDisponibles, asignarMejorVendedor, crearCitaConMeet } from "./citas";
import { detectarSlotSeleccionado } from "@/lib/ai/slot-matcher";
import { logAgen } from "./log-agendamiento";
import { createServiceClient } from "@/lib/supabase/service";
import { dispararHooksPostConversacion } from "./post-conversacion";
// S31 — Arquitectura de Objeciones
import { evaluarFaseSetter } from "@/lib/ai/setter-protocol";
import { evaluarCualificacion } from "@/lib/ai/cualificacion";
import { filtrarResistencia } from "@/lib/ai/filtro-objecion";
import { identificarDesconfianza } from "@/lib/ai/tres-desconfianzas";
import { construirProtocoloObjecion } from "@/lib/ai/protocolo-objecion";
import { obtenerRolDinamico } from "./rol-dinamico";

export async function procesarConversacion(
  telefono: string,
  mensajes: string[],
  waMessageId?: string
) {
  let lead: Awaited<ReturnType<typeof obtenerOCrearLead>>;
  try {
    lead = await obtenerOCrearLead(telefono);
  } catch {
    return;
  }

  // Comprobante de pago: respuesta canned + salir
  if (mensajes.some((m) => m.startsWith("[Imagen: comprobante]"))) {
    for (const contenido of mensajes) {
      await guardarMensaje({ leadId: lead.id, contenido, direccion: "entrante", waMessageId });
    }
    const ack = "¡Recibimos tu comprobante! Nuestro equipo lo verificará en breve y te confirmaremos tu inscripción. ¡Gracias por tu confianza!";
    await enviarRespuestaWhatsApp(telefono, [ack]);
    await guardarMensaje({ leadId: lead.id, contenido: ack, direccion: "saliente" });
    return;
  }

  // Privacidad: si el lead acepta en este mensaje, registrar y salir
  const textoEntrada = mensajes.join(" ");
  if (!lead.privacidad_aceptada && detectarAceptacion(textoEntrada)) {
    await marcarPrivacidadAceptada(lead.id);
    for (const contenido of mensajes) {
      await guardarMensaje({ leadId: lead.id, contenido, direccion: "entrante", waMessageId });
    }
    const confirmacion = "¡Gracias por aceptar nuestra Política de Privacidad! ¿En qué puedo ayudarte hoy con tu certificación CONOCER?";
    await enviarRespuestaWhatsApp(telefono, [confirmacion]);
    await guardarMensaje({ leadId: lead.id, contenido: confirmacion, direccion: "saliente" });
    return;
  }

  // Rama cliente previo
  if (lead.compra_previa) {
    await guardarMensaje({ leadId: lead.id, contenido: mensajes.join("\n"), direccion: "entrante", waMessageId });
    await enviarRespuestaWhatsApp(telefono, [
      "¡Hola! Veo que ya eres parte de nuestra familia en Centro ECM 🎓",
      "¿En qué puedo apoyarte hoy con tu proceso de certificación?",
    ]);
    return;
  }

  const historial = await obtenerHistorial(lead.id);
  const intencion = await clasificarIntencion(mensajes, historial);

  for (const [i, contenido] of mensajes.entries()) {
    await guardarMensaje({
      leadId: lead.id, contenido, direccion: "entrante",
      intencion: i === 0 ? intencion : null,
      waMessageId: i === 0 ? waMessageId : undefined,
    });
  }

  void capturarContactoPasivo(lead.id, mensajes).catch(console.error);
  await inferirEtapaPipeline(lead.id, historial, intencion);
  inferirTemperamento(lead.id, mensajes).catch(console.error);

  const supabase = createServiceClient();
  const [{ data: leadActualizado }, estadoCagc, etiquetasLead] = await Promise.all([
    supabase
      .from("leads")
      .select("nombre, email, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa, canal_origen, setter_fase_actual, setter_calificado")
      .eq("id", lead.id)
      .single(),
    obtenerFaseLead(lead.id).catch(() => null),
    obtenerEtiquetasLead(lead.id).catch(() => []),
  ]);

  // Slots / cita
  let slotsParaAI = undefined;
  let meetLinkParaAI: string | null = null;

  if (intencion === "quiere_agendar") {
    try {
      const vendedorId = await asignarMejorVendedor();
      if (vendedorId) {
        slotsParaAI = await obtenerSlotsDisponibles(vendedorId);
        void logAgen({ paso: "slots_consultados", leadId: lead.id, vendedorId,
          detalle: `${slotsParaAI.length} slots disponibles`, metadata: { slots: slotsParaAI.length, vendedor_id: vendedorId } });
      }
    } catch (err) {
      void logAgen({ paso: "error", nivel: "error", leadId: lead.id,
        detalle: `Error slots: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  if (intencion === "confirmando_slot") {
    try {
      const vendedorId = await asignarMejorVendedor();
      if (vendedorId) {
        const slots = await obtenerSlotsDisponibles(vendedorId);
        const slot = await detectarSlotSeleccionado(mensajes.join(" "), slots);
        if (slot) {
          const { citaId, meetLink } = await crearCitaConMeet({ leadId: lead.id, vendedorId, inicio: slot.inicio, fin: slot.fin });
          meetLinkParaAI = meetLink;
          void logAgen({ paso: "cita_creada", citaId, leadId: lead.id, vendedorId,
            detalle: "Cita creada desde WA", metadata: { meetLink, inicio: slot.inicio.toISOString() } });
        }
      }
    } catch (err) {
      void logAgen({ paso: "error", nivel: "error", leadId: lead.id,
        detalle: `Error cita: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // S31 — Preparar contexto de Setter, Objeción y Rol Dinámico en paralelo
  const setterFaseActual: number = (leadActualizado?.setter_fase_actual as number | null) ?? 1;
  const setterCalificado: boolean | null = (leadActualizado?.setter_calificado as boolean | null) ?? null;
  const esObjecion = intencion === "objecion_precio" || intencion === "objecion_confianza";
  const setterActivo = setterCalificado === null; // se desactiva al calificar o descalificar

  const [setterEstado, filtroResult, rolesDinamicos] = await Promise.all([
    setterActivo && historial
      ? evaluarFaseSetter(setterFaseActual, mensajes, historial, leadActualizado?.temperamento_inferido ?? null).catch(() => null)
      : Promise.resolve(null),
    esObjecion
      ? filtrarResistencia(mensajes, historial).catch(() => null)
      : Promise.resolve(null),
    obtenerRolDinamico(lead.id).catch(() => []),
  ]);

  // Si el setter avanzó de fase, persistir en BD (fire-and-forget)
  if (setterEstado?.debeAvanzar && setterEstado.faseNueva !== setterFaseActual) {
    void (async () => {
      await supabase.from("leads").update({ setter_fase_actual: setterEstado!.faseNueva }).eq("id", lead.id);
    })().catch(console.error);
  }

  // Si llegamos a fase 5 (cualificación), evaluar y persistir resultado
  if (setterActivo && (setterEstado?.faseNueva === 5 || setterFaseActual === 5)) {
    const serviciosAncla: string[] = [];
    evaluarCualificacion(mensajes, historial, leadActualizado?.nombre ?? null, serviciosAncla)
      .then(async (result) => {
        await supabase.from("leads").update({
          setter_calificado: result.califica,
          ...(result.razonDescalificacion && { setter_razon_descalificacion: result.razonDescalificacion }),
        }).eq("id", lead.id);

        // Si no califica: enviar despedida amable + activar nurturing
        if (!result.califica && result.mensajeDesacuerdo) {
          await enviarRespuestaWhatsApp(telefono, [result.mensajeDesacuerdo]);
          await guardarMensaje({ leadId: lead.id, contenido: result.mensajeDesacuerdo, direccion: "saliente" });
        }
      })
      .catch(console.error);
  }

  // Construir protocolo de objeción si aplica
  let protocoloObjecion = null;
  if (filtroResult) {
    const desconfianza = filtroResult.tipo === "objecion"
      ? await identificarDesconfianza(mensajes, historial).catch(() => null)
      : null;
    protocoloObjecion = construirProtocoloObjecion(filtroResult.tipo, desconfianza?.tipo ?? null);
  }

  const { texto: respuesta, scoreConfianza } = await generarRespuesta(mensajes, {
    nombre: leadActualizado?.nombre ?? null,
    temperamento: leadActualizado?.temperamento_inferido ?? null,
    pipelineStage: leadActualizado?.pipeline_stage ?? "Nuevo",
    compraPreviaa: leadActualizado?.compra_previa ?? false,
    historial,
    pipelineRuta: leadActualizado?.pipeline_ruta ?? "tripwire",
    faseCAGC: estadoCagc?.fase_numero,
    etiquetas: etiquetasLead.map((e) => `${e.categoria}:${e.nombre}`),
    slotsDisponibles: slotsParaAI,
    meetLink: meetLinkParaAI,
    canal_origen: leadActualizado?.canal_origen ?? null,
    setterEstado,
    protocoloObjecion,
    rolesDinamicos,
  });

  // Compra inmediata: adjuntar link Stripe
  if (intencion === "compra_inmediata" || intencion === "compra") {
    const linkStripe = await generarLinkStripe(lead.id).catch(() => null);
    if (linkStripe) {
      await enviarRespuestaWhatsApp(telefono, [...dividirRespuesta(respuesta), `💳 Puedes completar tu inscripción aquí: ${linkStripe}`]);
      await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
      return;
    }
  }

  const requiereHandoff = await necesitaHandoff(mensajes, respuesta);
  if (requiereHandoff) await crearTicketHandoff(lead.id, mensajes.join("\n"));

  const bloques = dividirRespuesta(respuesta);
  const config = await obtenerConfig().catch(() => ({ modo_operacion: "automatico" as const, umbral_confianza: 0.80 }));

  if (config.modo_operacion === "seguro") {
    await encolarRespuesta({ leadId: lead.id, telefono, respuesta, bloques });
    await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
    return;
  }

  if (config.modo_operacion === "seguro_automatico" && scoreConfianza < config.umbral_confianza) {
    await encolarRespuesta({ leadId: lead.id, telefono, respuesta, bloques, scoreConfianza });
    await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
    return;
  }

  await enviarRespuestaWhatsApp(telefono, bloques);
  const msgSaliente = await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });

  if (!lead.privacidad_aceptada && !historial) {
    void enviarRespuestaWhatsApp(telefono, [mensajeAvisoPrivacidad()]).catch(console.error);
  }

  // Datos faltantes (S15.2) — usa nombre/email del leadActualizado para reflejar captura pasiva
  const nombreActual = leadActualizado?.nombre ?? lead.nombre ?? null;
  const emailActual = leadActualizado?.email ?? lead.email ?? null;
  const canalActual = leadActualizado?.canal_origen ?? null;
  if (historial && (!nombreActual || !emailActual)) {
    const solicitud = await generarSolicitudDatosFaltantes(
      { id: lead.id, nombre: nombreActual, email: emailActual }, historial, canalActual ?? undefined
    ).catch(() => null);
    if (solicitud) {
      void enviarRespuestaWhatsApp(telefono, [solicitud]).catch(console.error);
      void guardarMensaje({ leadId: lead.id, contenido: solicitud, direccion: "saliente" }).catch(console.error);
    }
  }

  // Hooks fire-and-forget (extraídos a post-conversacion.ts)
  dispararHooksPostConversacion({
    leadId: lead.id, telefono, mensajes, historial, intencion,
    mensajeSalienteId: msgSaliente?.id,
    estadoCagc,
  });
}

function dividirRespuesta(texto: string): string[] {
  if (texto.length <= 160) return [texto];
  const oraciones = texto.match(/[^.!?]+[.!?]+/g) ?? [texto];
  const bloques: string[] = [];
  let bloque = "";
  for (const oracion of oraciones) {
    if ((bloque + oracion).length > 160) {
      if (bloque) bloques.push(bloque.trim());
      bloque = oracion;
    } else {
      bloque += oracion;
    }
  }
  if (bloque.trim()) bloques.push(bloque.trim());
  return bloques.length > 0 ? bloques : [texto];
}
