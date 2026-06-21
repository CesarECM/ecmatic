import { obtenerOCrearLead, inferirEtapaPipeline, inferirTemperamento } from "./leads";
import { guardarMensaje, obtenerHistorial } from "./mensajes";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { generarRespuesta, necesitaHandoff } from "@/lib/ai/motor-respuesta";
import { enviarRespuestaWhatsApp } from "./whatsapp-sender";
import { crearTicketHandoff } from "./tickets";
import { detectarCompetidores } from "./competidores";
import { detectarPromesas } from "./promesas";
import { detectarMomentoCierre } from "./momentos-cierre";
import { generarLinkStripe } from "./pagos";
import { detectarAceptacion, marcarPrivacidadAceptada, mensajeAvisoPrivacidad } from "./privacidad";
import { inferirYRegistrarFase, obtenerFaseLead } from "./cagc";
import { generarSolicitudDatosFaltantes } from "./limpieza-leads";
import { obtenerEtiquetasLead } from "./etiquetas";
import { obtenerConfig } from "./sistema";
import { evaluarYAsignarTarea } from "./motor-tareas";
import { generarOfertaConsultiva } from "./oferta-consultiva";
import { ofrecerLeadmagnet } from "./selector-leadmagnet";
import { encolarRespuesta } from "./mensajes-aprobacion";
import { capturarContactoPasivo } from "./captura-contacto";
import { actualizarContextoIA } from "./contexto";
import { createServiceClient } from "@/lib/supabase/service";

// Orquestador principal — ejecutado después de drenar el buffer
export async function procesarConversacion(
  telefono: string,
  mensajes: string[],
  waMessageId?: string
) {
  // 1. Obtener o crear lead — lanza si está en blacklist (S15.3)
  let lead: Awaited<ReturnType<typeof obtenerOCrearLead>>;
  try {
    lead = await obtenerOCrearLead(telefono);
  } catch {
    return; // número en blacklist — descartar silenciosamente
  }

  // S18.2 — Comprobante de pago: respuesta canned + salir (admin revisa en panel)
  if (mensajes.some((m) => m.startsWith("[Imagen: comprobante]"))) {
    for (const contenido of mensajes) {
      await guardarMensaje({ leadId: lead.id, contenido, direccion: "entrante", waMessageId });
    }
    const ack = "¡Recibimos tu comprobante! Nuestro equipo lo verificará en breve y te confirmaremos tu inscripción. ¡Gracias por tu confianza!";
    await enviarRespuestaWhatsApp(telefono, [ack]);
    await guardarMensaje({ leadId: lead.id, contenido: ack, direccion: "saliente" });
    return;
  }

  // S12.9 — Privacidad LFPDPPP: si el lead acepta en este mensaje, registrar y salir
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

  // 2. S1.7 — rama cliente previo
  if (lead.compra_previa) {
    await guardarMensaje({
      leadId: lead.id,
      contenido: mensajes.join("\n"),
      direccion: "entrante",
      waMessageId,
    });
    // Respuesta diferenciada para clientes activos
    await enviarRespuestaWhatsApp(telefono, [
      "¡Hola! Veo que ya eres parte de nuestra familia en Centro ECM 🎓",
      "¿En qué puedo apoyarte hoy con tu proceso de certificación?",
    ]);
    return;
  }

  // 3. Historial para contexto IA
  const historial = await obtenerHistorial(lead.id);

  // 4. S1.3 — Clasificar intención
  const intencion = await clasificarIntencion(mensajes, historial);

  // 5. Guardar mensajes entrantes
  for (const [i, contenido] of mensajes.entries()) {
    await guardarMensaje({
      leadId: lead.id,
      contenido,
      direccion: "entrante",
      intencion: i === 0 ? intencion : null,
      waMessageId: i === 0 ? waMessageId : undefined,
    });
  }

  // S20.5 — Captura pasiva de email/nombre desde el texto entrante (fire-and-forget)
  void capturarContactoPasivo(lead.id, mensajes).catch(console.error);

  // 6. S1.8 — Inferir y actualizar etapa de pipeline
  await inferirEtapaPipeline(lead.id, historial, intencion);

  // 7. S1.9 — Inferir temperamento (silencioso, sin bloquear)
  inferirTemperamento(lead.id, mensajes).catch(console.error);

  // 8. S1.4 — Generar respuesta
  const supabase = createServiceClient();
  const [{ data: leadActualizado }, estadoCagc, etiquetasLead] = await Promise.all([
    supabase
      .from("leads")
      .select("nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa")
      .eq("id", lead.id)
      .single(),
    obtenerFaseLead(lead.id).catch(() => null),
    obtenerEtiquetasLead(lead.id).catch(() => []),
  ]);

  const { texto: respuesta, scoreConfianza } = await generarRespuesta(mensajes, {
    nombre: leadActualizado?.nombre ?? null,
    temperamento: leadActualizado?.temperamento_inferido ?? null,
    pipelineStage: leadActualizado?.pipeline_stage ?? "Nuevo",
    compraPreviaa: leadActualizado?.compra_previa ?? false,
    historial,
    pipelineRuta: leadActualizado?.pipeline_ruta ?? "tripwire",
    faseCAGC: estadoCagc?.fase_numero,
    etiquetas: etiquetasLead.map((e) => `${e.categoria}:${e.nombre}`),
  });

  // 8.5. S8.1 — Si la intención es compra inmediata, generar link Stripe
  if (intencion === "compra_inmediata" || intencion === "compra") {
    const linkStripe = await generarLinkStripe(lead.id).catch(() => null);
    if (linkStripe) {
      await enviarRespuestaWhatsApp(telefono, [
        ...dividirRespuesta(respuesta),
        `💳 Puedes completar tu inscripción aquí: ${linkStripe}`,
      ]);
      await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
      return;
    }
  }

  // 9. S1.10 — Detectar handoff
  const requiereHandoff = await necesitaHandoff(mensajes, respuesta);
  if (requiereHandoff) {
    await crearTicketHandoff(lead.id, mensajes.join("\n"));
  }

  // 10. S1.5 + S1.6 — Enviar respuesta (o encolar según modo S17.3/S17.4)
  const bloques = dividirRespuesta(respuesta);
  const config = await obtenerConfig().catch(() => ({ modo_operacion: "automatico" as const, umbral_confianza: 0.80 }));

  if (config.modo_operacion === "seguro") {
    // S17.3 — Modo Seguro: cola siempre
    await encolarRespuesta({ leadId: lead.id, telefono, respuesta, bloques });
    await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
    return;
  }

  if (config.modo_operacion === "seguro_automatico" && scoreConfianza < config.umbral_confianza) {
    // S17.4 — Modo Seguro Automático: cola solo si score bajo
    await encolarRespuesta({ leadId: lead.id, telefono, respuesta, bloques, scoreConfianza });
    await guardarMensaje({ leadId: lead.id, contenido: respuesta, direccion: "saliente" });
    return;
  }

  await enviarRespuestaWhatsApp(telefono, bloques);

  // 11. Guardar respuesta saliente
  const msgSaliente = await guardarMensaje({
    leadId: lead.id,
    contenido: respuesta,
    direccion: "saliente",
  });

  // S12.9 — En primera interacción, añadir aviso de privacidad (fire-and-forget)
  if (!lead.privacidad_aceptada && !historial) {
    void enviarRespuestaWhatsApp(telefono, [mensajeAvisoPrivacidad()]).catch(console.error);
  }

  // S5.8 — Detectar competidores mencionados (fire-and-forget)
  const textoCompleto = mensajes.join(" ");
  void detectarCompetidores(textoCompleto, lead.id).catch(console.error);

  // S5.10 — Detectar promesas en los mensajes del lead (fire-and-forget)
  if (msgSaliente?.id) {
    void detectarPromesas(textoCompleto, lead.id, msgSaliente.id).catch(console.error);
  }

  // S5.9 — Detectar momentos de cierre en la respuesta (fire-and-forget)
  if (msgSaliente?.id) {
    void detectarMomentoCierre(lead.id, msgSaliente.id, textoCompleto, intencion).catch(console.error);
  }

  // S13.2 — Inferir y actualizar fase CAGC del lead (fire-and-forget, silencioso)
  void inferirYRegistrarFase(lead.id, mensajes, historial).catch(console.error);

  // S19.6/S19.7 — Escáner de señales situacionales + oferta consultiva (fire-and-forget)
  // Solo actúa si hay historial y el lead ya definió su problema (fase ≥ 3)
  if (historial && (estadoCagc?.fase_numero ?? 0) >= 3) {
    void generarOfertaConsultiva(lead.id, telefono).catch(console.error);
  }

  // S20.2 — Motor de selección y oferta de leadmagnet (fire-and-forget)
  // Solo si hay historial y fase CAGC conocida (el leadmagnet filtra por fase internamente)
  if (historial && estadoCagc !== null) {
    void ofrecerLeadmagnet(lead.id, telefono, estadoCagc.fase_numero).catch(console.error);
  }

  // S14.2 — Sugerir etiquetas (fire-and-forget, solo si hay historial)
  if (historial) {
    const { sugerirEtiquetasParaLead } = await import("@/lib/ai/etiquetas-ia");
    void sugerirEtiquetasParaLead(lead.id, mensajes, historial).catch(console.error);
  }

  // S17.6 — Reevaluar tarea de fondo tras cada conversación (fire-and-forget)
  void evaluarYAsignarTarea(lead.id, "conversacion").catch(console.error);

  // S23.3 — Actualizar Contexto interpretativo del lead (fire-and-forget)
  const accionContexto = `Conversación WhatsApp — intención: ${intencion}`;
  void actualizarContextoIA(lead.id, accionContexto).catch(console.error);

  // S15.2 — Solicitar datos faltantes si hay señal positiva y la conversación ya avanzó
  if (historial && (!lead.nombre || !lead.email)) {
    const solicitud = await generarSolicitudDatosFaltantes(
      { id: lead.id, nombre: lead.nombre ?? null, email: lead.email ?? null },
      historial
    ).catch(() => null);
    if (solicitud) {
      void enviarRespuestaWhatsApp(telefono, [solicitud]).catch(console.error);
      void guardarMensaje({ leadId: lead.id, contenido: solicitud, direccion: "saliente" }).catch(console.error);
    }
  }
}

// S1.5 — Divide respuestas largas en bloques de ≤160 caracteres
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
