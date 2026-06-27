// GHL-9.2 — Haiku: clasifica el mensaje del lead durante un flujo de pago pendiente.
// Determina si el lead está enviando comprobante, indicando una hora o simplemente no puede pagar ahora.
import { callClaudeIA } from "./client";

export type EstadoPago =
  | "comprobante"   // lead adjunta imagen o escribe que ya pagó
  | "indica_hora"   // lead dice a qué hora lo hará ("a las 7", "en 2 horas")
  | "no_puede"      // lead no puede pagar ahorita, sin dar hora concreta
  | "confirma"      // lead confirma que sí enviará (respuesta afirmativa a pregunta de la IA)
  | "otro";         // cualquier otro mensaje — continuar conversación normal

export interface DeteccionPago {
  estado: EstadoPago;
  hora_texto?: string; // presente solo cuando estado === "indica_hora"
}

const ESTADOS_VALIDOS: EstadoPago[] = ["comprobante", "indica_hora", "no_puede", "confirma", "otro"];

const SYSTEM = `Eres un clasificador para un sistema de seguimiento de pagos de Centro ECM, centro de certificación CONOCER en México.

El lead recibió información de pago y la IA está esperando el comprobante de transferencia. Clasifica el mensaje del lead:

- "comprobante": el lead adjunta una imagen, envía una captura de pantalla, o escribe que ya realizó el pago ("aquí está", "ya pagué", "te mando el comprobante", o mensaje con attachment/imagen).
- "indica_hora": el lead dice a qué hora va a pagar. Extrae la hora como texto literal. Ejemplos: "a las 7pm", "en dos horas", "ahorita a las 3", "mañana a las 10am".
- "no_puede": el lead no puede pagar en este momento pero no da una hora específica. Ejemplos: "ahorita no puedo", "más tarde", "después".
- "confirma": el lead responde afirmativamente a la pregunta de la IA sobre el recordatorio. Ejemplos: "sí", "ok", "claro", "va", "perfecto".
- "otro": cualquier otra cosa — duda, pregunta, objeción, saludo, etc.

Responde SOLO en JSON sin texto extra:
{ "estado": "indica_hora", "hora_texto": "7pm" }
{ "estado": "comprobante" }
{ "estado": "no_puede" }
{ "estado": "confirma" }
{ "estado": "otro" }`;

export async function detectarEstadoPago(
  mensajeLead: string,
  meta?: { leadId?: string; traceId?: string }
): Promise<DeteccionPago> {
  let raw = "";

  try {
    const resp = await callClaudeIA(
      "DETECTAR_ESTADO_PAGO",
      {
        max_tokens: 60,
        system: SYSTEM,
        messages: [{ role: "user", content: mensajeLead.slice(0, 500) }],
      },
      meta
    );
    raw = (resp.content[0] as { text: string }).text.trim();
  } catch {
    return { estado: "otro" };
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { estado: "otro" };

  try {
    const parsed = JSON.parse(match[0]) as { estado?: unknown; hora_texto?: unknown };
    const estado = ESTADOS_VALIDOS.includes(parsed.estado as EstadoPago)
      ? (parsed.estado as EstadoPago)
      : "otro";
    const hora_texto =
      estado === "indica_hora" && typeof parsed.hora_texto === "string"
        ? parsed.hora_texto
        : undefined;
    return { estado, hora_texto };
  } catch {
    return { estado: "otro" };
  }
}
