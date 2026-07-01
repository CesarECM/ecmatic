// GHL-9.4 / MPS-5 / MPS-15 — Haiku: genera el copy del mensaje de follow-up por tipo × nivel.
// MPS-15: inyecta historial de conversación; tool use permite extenderlo si el contexto es insuficiente.
import { callClaudeIA } from "./client";
import { logSistema } from "@/services/log-sistema";
import { obtenerHistorial } from "@/services/mensajes";
import type { TipoSeguimiento } from "@/services/seguimiento-lead";

export interface ContextoFollowup {
  nombre: string | null;
  tipo: TipoSeguimiento;
  nivel: number;          // 1-indexed — el nivel del mensaje a enviar
  horarioPrometido?: string | null;  // texto legible, ej. "7pm" o "las 3 de la tarde"
  gatilloSnapshot?: string | null;   // ej. "Precio especial: $1,799 hasta el 30 jun"
  linkPago?: string | null;          // URL de pago total (landing o pasarela)
  linkApartado?: string | null;      // URL de apartado
  historial?: string | null;         // últimos N mensajes — "Lead: …\nECMatic: …"
}

const INSTRUCCIONES: Record<TipoSeguimiento, Record<number, string>> = {
  demo_agendado: {
    1: `El lead acaba de terminar (o está a punto de terminar) su sesión de presentación del servicio.
Escribe un mensaje cálido y breve preguntando cómo estuvo la reunión. Muestra interés genuino.
Hazle una pregunta abierta que invite a responder: si quedó alguna duda, si le fue útil la información.
NO menciones pago ni inscripción todavía. Solo abre la conversación post-reunión.`,

    2: `El lead no respondió al primer mensaje post-reunión. Probablemente está evaluando la decisión.
Escribe un mensaje empático y muy corto. Reconoce que la decisión toma tiempo.
Ofrece resolver cualquier duda que haya quedado de la sesión sin presionar.
Cierra con una pregunta simple de sí/no para reducir fricción ("¿te quedó alguna duda?").`,

    3: `Tercer y último intento después de la reunión. El lead no ha respondido.
Escribe un mensaje muy humano y sin presión. Deja la puerta completamente abierta.
Si hay gatillo de urgencia activo, incorpóralo de forma suave al final.
Máximo 2 oraciones. Tono: "aquí sigo cuando estés listo/a".`,
  },
  payment: {
    1: `El lead prometió pagar a una hora específica. Ya llegó esa hora y no ha enviado el comprobante.
Escribe un recordatorio cálido y breve. Menciona que estás esperando el comprobante.
Si hay gatillo de urgencia (precio o fecha límite), incorpóralo naturalmente.
NO presiones. Tono de acompañamiento, no de cobrador.`,

    2: `El lead no respondió al primer recordatorio (probablemente ya era tarde/noche).
Escribe un mensaje empático para el siguiente día. Asume que se complicó hacer el movimiento bancario.
Mantén la puerta abierta. Sigue esperando el comprobante.
Tono: comprensivo y servicial, no insistente.`,

    3: `El lead no ha respondido en 2 días. Usa la técnica de social proof + urgencia suave.
Menciona que en la oficina administrativa ya están esperando el comprobante para completar el registro.
Usa algo parecido a "ya te registré en el sistema" para generar compromiso (principio de consistencia).
Si hay gatillo de urgencia, este es el momento de usarlo. Máximo 3 oraciones.`,

    4: `Último intento automático antes de escalar a atención personalizada.
Escribe un mensaje muy breve y humano. Reconoce que la vida se complica.
Ofrece reagendar o hablar por teléfono si necesitan apoyo para completar el pago.
Sin presión, cierre empático.`,
  },
  conversational: {
    1: `El lead respondió al mensaje de campaña pero lleva horas sin contestar.
Escribe un follow-up suave para retomar la conversación. Muestra interés genuino.
Recuérdale en qué punto estaban sin repetir todo. Hazle una pregunta abierta al final.`,

    2: `El lead no respondió al primer follow-up. Probablemente está ocupado.
Escribe un mensaje breve y empático. Reconoce que el momento puede no ser el indicado.
Ofrece continuar cuando sea buen momento para él/ella. Sin presión. Una sola pregunta al final.`,

    3: `El lead lleva varios días sin contestar. Cambia el ángulo completamente.
En lugar de retomar la conversación previa, comparte un dato concreto y útil sobre el proceso
de certificación CONOCER (duración, documentos, beneficios laborales) que pueda interesarle.
Cierra con una pregunta relacionada con su situación personal.
Tono: informativo y genuinamente útil, sin referencia a mensajes anteriores.`,

    4: `El lead lleva mucho tiempo sin responder. Reduce la fricción al mínimo.
Escribe un mensaje muy corto reconociendo que quizás el momento no es el adecuado.
Ofrece una alternativa diferente: una llamada rápida de 5 minutos en lugar de chat.
Tono: sin expectativa, dejando que él/ella decida. Sin referencia a mensajes previos.`,

    5: `Último intento automático. No hay más mensajes después de este.
Escribe el mensaje más corto y humano del ciclo. Máximo dos oraciones.
Deja la puerta completamente abierta para cuando decida retomar el contacto.
No menciones cuántas veces has escrito. No repitas información.
Tono: respetuoso, sin presión, cierra el ciclo con calidez.`,
  },
  nurturing: {
    1: `El lead llegó al funnel (puede ser por campaña o WhatsApp directo) pero se quedó en silencio.
Escribe un follow-up que retome el contexto de lo que estaban hablando.
Hazle una pregunta concreta relacionada con el proceso de certificación CONOCER.
Tono amigable y proactivo.`,

    2: `Segundo intento de contacto. El lead sigue sin responder.
Escribe un mensaje corto y empático. Muestra que entiendes que está ocupado.
Ofrece ser flexible con los tiempos. Cierra con una pregunta simple de sí/no para reducir fricción.`,

    3: `Tercer intento. Usa la escasez de cupos o una historia de éxito de otro candidato.
Recuérdales el beneficio concreto de certificarse. Máximo 2 oraciones + una pregunta.`,

    4: `El lead lleva semanas en silencio. Prueba un ángulo completamente distinto: una historia breve.
Menciona en términos generales a alguien en una situación similar que ya se certificó y el resultado
concreto que obtuvo (ingresos, reconocimiento, ascenso). Sin nombres reales, solo el resultado.
Cierra con una pregunta directa: ¿algo así te interesaría?
Máximo 2-3 oraciones. Tono: inspirador, sin sonar a anuncio.`,

    5: `El lead sigue sin responder. Cambia completamente de ritmo y tono.
Escribe un mensaje muy breve que solo pregunte si el momento ha cambiado para él/ella.
Nada de información nueva. Solo abre la puerta de forma simple y sin rodeos.
Máximo 1-2 oraciones. Ejemplo de enfoque: "¿Sigues interesado/a o te llamo en otro momento?"`,

    6: `Último mensaje automático del ciclo de nurturing.
Escribe el mensaje más humano y sin expectativas de todo el ciclo.
Reconoce que ha pasado tiempo y que probablemente las circunstancias cambiaron.
Deja claro que puede regresar cuando quiera, sin explicaciones ni presión.
No cierres una venta — preserva la relación para un contacto futuro.
Máximo 2 oraciones.`,
  },
};

export async function generarFollowupGHL(
  ctx: ContextoFollowup,
  meta?: { leadId?: string; traceId?: string }
): Promise<string> {
  const instruccionesParaTipo = INSTRUCCIONES[ctx.tipo];
  if (!instruccionesParaTipo) return "";

  // Si nivel > último nivel definido, reusar el último disponible.
  // Ocurre cuando max_intentos en followup_config supera el nº de instrucciones definidas.
  const nivelesDisponibles = Object.keys(instruccionesParaTipo).map(Number);
  const nivelEfectivo = nivelesDisponibles.includes(ctx.nivel)
    ? ctx.nivel
    : Math.max(...nivelesDisponibles);

  const instruccion = instruccionesParaTipo[nivelEfectivo];
  if (!instruccion) return "";

  const partes: string[] = [];
  if (ctx.nombre) partes.push(`Nombre del lead: ${ctx.nombre}`);
  if (ctx.horarioPrometido) partes.push(`Hora que el lead prometió pagar: ${ctx.horarioPrometido}`);
  if (ctx.gatilloSnapshot) partes.push(`Gatillo de urgencia activo: ${ctx.gatilloSnapshot}`);
  if (ctx.tipo === "payment") {
    if (ctx.linkPago)     partes.push(`Link de pago principal: ${ctx.linkPago}`);
    if (ctx.linkApartado) partes.push(`Link de apartado: ${ctx.linkApartado}`);
  }

  const contextoTexto = partes.length > 0 ? partes.join("\n") : "(sin contexto adicional)";

  const linksDisponibles = ctx.tipo === "payment" && (ctx.linkPago || ctx.linkApartado)
    ? [
        "\nLINKS DISPONIBLES — inclúyelos cuando refuercen el mensaje o el lead pueda necesitarlos:",
        ctx.linkPago     ? `• Pago completo: ${ctx.linkPago}` : "",
        ctx.linkApartado ? `• Apartar lugar: ${ctx.linkApartado}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const historialLinea = ctx.historial
    ? `\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n${ctx.historial}\n\nUsa este historial para personalizar tu mensaje: retoma el hilo, evita repetir lo que ya se dijo y adapta el tono al punto exacto donde quedó la conversación.`
    : "\nHISTORIAL RECIENTE: (sin conversación previa registrada)";

  const system = `Eres la IA de ventas de Centro ECM (ceecm.mx), centro de certificación CONOCER en México.
Escribes mensajes de seguimiento para WhatsApp. Estilo: cálido, profesional, conversacional.
Reglas: sin saludos formales de correo, sin emojis de negocios, máximo 3 oraciones salvo que se indique lo contrario.
Siempre en español mexicano natural.
${historialLinea}

TAREA:
${instruccion}${linksDisponibles}

FORMATO DE SALIDA — OBLIGATORIO:
Responde ÚNICAMENTE con el texto del mensaje listo para enviar al lead. Sin notas internas, sin explicaciones, sin encabezados como "Aquí está el mensaje:", sin etiquetas entre corchetes, sin comentarios sobre lo que hiciste. El texto que escribas se enviará directamente al lead.`;

  const userContent = `CONTEXTO:\n${contextoTexto}`;

  // Elimina notas internas que el modelo podría agregar antes/después del mensaje real.
  // Patrones: líneas entre corchetes, prefijos "Nota:", "Aquí está el mensaje:", etc.
  function limpiarSalida(texto: string): string {
    return texto
      .replace(/^\s*\[.+?\]\s*\n?/gm, "")           // [Nota: ...] o [Contexto: ...]
      .replace(/^\s*\(.+?\)\s*\n/gm, "")              // (nota interna)
      .replace(/^(aquí (está|te (dejo|presento))|mensaje(:|$)|seguimiento:|recordatorio:).*/gim, "")
      .replace(/^\s*nota:.*/gim, "")                   // Nota: ... al inicio de línea
      .replace(/\n{3,}/g, "\n\n")                      // colapsar líneas vacías
      .trim();
  }

  const HISTORIAL_CAP = 30;

  const tool = {
    name: "solicitar_historial_adicional",
    description: "Solicita más mensajes del historial si el contexto actual es insuficiente para personalizar el follow-up. Úsalo solo cuando necesites entender un punto específico que el lead mencionó y que no aparece en los mensajes disponibles.",
    input_schema: {
      type: "object" as const,
      properties: {
        cantidad: {
          type: "integer",
          description: "Mensajes adicionales a cargar (entre 5 y 20)",
          minimum: 5,
          maximum: 20,
        },
      },
      required: ["cantidad"],
    },
  };

  try {
    // CALL 1 — con tool disponible
    const resp1 = await callClaudeIA(
      "GENERAR_FOLLOWUP_GHL",
      {
        max_tokens: 250,
        system,
        messages: [{ role: "user", content: userContent }],
        tools: [tool],
        tool_choice: { type: "auto" },
      },
      meta
    );

    // Respuesta directa (caso más común)
    if (resp1.stop_reason === "end_turn") {
      const textBlock = resp1.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
      return limpiarSalida(textBlock?.text ?? "");
    }

    // Tool use — la IA necesita más contexto
    if (resp1.stop_reason === "tool_use" && meta?.leadId) {
      const toolBlock = resp1.content.find((b) => b.type === "tool_use") as
        { type: "tool_use"; id: string; input: { cantidad?: number } } | undefined;

      if (toolBlock) {
        const cantidadExtra  = Math.min(toolBlock.input.cantidad ?? 10, 20);
        const limiteActual   = ctx.historial?.split("\n").length ?? 0;
        const limiteExtendido = Math.min(limiteActual + cantidadExtra, HISTORIAL_CAP);

        void logSistema({
          categoria: "ia", tipoAccion: "followup.historial_extension", fase: "ok",
          leadId: meta.leadId, traceId: meta.traceId,
          resultado: `+${cantidadExtra} msgs → total cap ${limiteExtendido}`,
          metadata: { tipo: ctx.tipo, nivel: ctx.nivel, limiteActual, cantidadExtra, limiteExtendido },
        });

        const historialExtendido = await obtenerHistorial(meta.leadId, limiteExtendido).catch(() => "");

        // CALL 2 — historial extendido, sin tools (forzado a text)
        const resp2 = await callClaudeIA(
          "GENERAR_FOLLOWUP_GHL_EXTENDED",
          {
            max_tokens: 250,
            system,
            messages: [
              { role: "user", content: userContent },
              { role: "assistant", content: resp1.content },
              {
                role: "user",
                content: [{
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: historialExtendido || "(sin mensajes adicionales disponibles)",
                }],
              },
            ],
          },
          meta
        );

        const textBlock2 = resp2.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
        return limpiarSalida(textBlock2?.text ?? "");
      }
    }

    // Fallback: extraer cualquier texto disponible
    const textFallback = resp1.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
    return limpiarSalida(textFallback?.text ?? "");
  } catch {
    return "";
  }
}
