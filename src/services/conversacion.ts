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
import { createServiceClient } from "@/lib/supabase/service";

// Orquestador principal — ejecutado después de drenar el buffer
export async function procesarConversacion(
  telefono: string,
  mensajes: string[],
  waMessageId?: string
) {
  // 1. Obtener o crear lead
  const lead = await obtenerOCrearLead(telefono);

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

  // 6. S1.8 — Inferir y actualizar etapa de pipeline
  await inferirEtapaPipeline(lead.id, historial, intencion);

  // 7. S1.9 — Inferir temperamento (silencioso, sin bloquear)
  inferirTemperamento(lead.id, mensajes).catch(console.error);

  // 8. S1.4 — Generar respuesta
  const supabase = createServiceClient();
  const { data: leadActualizado } = await supabase
    .from("leads")
    .select("nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa")
    .eq("id", lead.id)
    .single();

  const respuesta = await generarRespuesta(mensajes, {
    nombre: leadActualizado?.nombre ?? null,
    temperamento: leadActualizado?.temperamento_inferido ?? null,
    pipelineStage: leadActualizado?.pipeline_stage ?? "Nuevo",
    compraPreviaa: leadActualizado?.compra_previa ?? false,
    historial,
    pipelineRuta: leadActualizado?.pipeline_ruta ?? "tripwire",
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

  // 10. S1.5 + S1.6 — Enviar respuesta con delay natural
  const bloques = dividirRespuesta(respuesta);
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
