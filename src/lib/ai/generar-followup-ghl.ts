// GHL-9.4 / MPS-5 — Haiku: genera el copy del mensaje de follow-up por tipo × nivel.
// Tipos actualizados: payment | conversational | nurturing
import { callClaudeIA } from "./client";
import type { TipoSeguimiento } from "@/services/seguimiento-lead";

export interface ContextoFollowup {
  nombre: string | null;
  tipo: TipoSeguimiento;
  nivel: number;          // 1=primer recordatorio, 2=empático, 3=social proof (payment)
  horarioPrometido?: string | null;  // texto legible, ej. "7pm" o "las 3 de la tarde"
  gatilloSnapshot?: string | null;   // ej. "Precio especial: $1,799 hasta el 30 jun"
}

const INSTRUCCIONES: Record<TipoSeguimiento, Record<number, string>> = {
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

    2: `El lead no respondió al primer follow-up. Este es el último intento.
Escribe un mensaje breve. Reconoce que está ocupado. Deja la puerta completamente abierta.
Ofrece continuar cuando sea buen momento para él/ella. Sin presión.`,
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
  },
};

export async function generarFollowupGHL(
  ctx: ContextoFollowup,
  meta?: { leadId?: string; traceId?: string }
): Promise<string> {
  const instruccion = INSTRUCCIONES[ctx.tipo]?.[ctx.nivel];
  if (!instruccion) return "";

  const partes: string[] = [];
  if (ctx.nombre) partes.push(`Nombre del lead: ${ctx.nombre}`);
  if (ctx.horarioPrometido) partes.push(`Hora que el lead prometió pagar: ${ctx.horarioPrometido}`);
  if (ctx.gatilloSnapshot) partes.push(`Gatillo de urgencia activo: ${ctx.gatilloSnapshot}`);

  const contextoTexto = partes.length > 0 ? partes.join("\n") : "(sin contexto adicional)";

  const system = `Eres la IA de ventas de Centro ECM (ceecm.mx), centro de certificación CONOCER en México.
Escribes mensajes de seguimiento para WhatsApp. Estilo: cálido, profesional, conversacional.
Reglas: sin saludos formales de correo, sin emojis de negocios, máximo 3 oraciones salvo que se indique lo contrario.
Siempre en español mexicano natural.

TAREA:
${instruccion}`;

  const userContent = `CONTEXTO:\n${contextoTexto}`;

  try {
    const resp = await callClaudeIA(
      "GENERAR_FOLLOWUP_GHL",
      {
        max_tokens: 250,
        system,
        messages: [{ role: "user", content: userContent }],
      },
      meta
    );
    return (resp.content[0] as { text: string }).text.trim();
  } catch {
    return "";
  }
}
