import { randomUUID } from "crypto";
import { callClaudeIA } from "./client";

export interface ScoreMensajeGHL {
  score: number;
  razon: string;
}

const SYSTEM = `Eres un evaluador de calidad de mensajes de ventas para Centro ECM (ceecm.mx), centro de certificación CONOCER en México.

Tu tarea: dado el mensaje que envió el lead y la respuesta generada por la IA, evalúa qué tan buena es esa respuesta.

Criterios de evaluación:
- Relevancia: ¿responde directamente lo que el lead preguntó o expresó?
- Avance: ¿mueve al lead hacia el cierre o la siguiente etapa?
- Tono: ¿es empático, profesional y no agresivo?
- Claridad: ¿es fácil de entender, sin jerga innecesaria?
- Timing: ¿es el momento adecuado para esa respuesta?

Escala de score (0.0 a 1.0):
- 0.90-1.00: Excelente. Respuesta perfecta, avanza el proceso, tono ideal.
- 0.70-0.89: Buena. Apropiada aunque mejorable en algún aspecto.
- 0.50-0.69: Aceptable. Neutral, no daña pero tampoco avanza mucho.
- 0.30-0.49: Deficiente. Demasiado genérica o no responde bien el mensaje.
- 0.00-0.29: Mala. Respuesta incorrecta, tono inadecuado, o contraproducente.

Responde SOLO en JSON (sin texto extra):
{
  "score": 0.85,
  "razon": "Responde la objeción de precio con empatía y redirige hacia el valor de la certificación"
}`;

export async function evaluarScoreMensajeGHL(
  mensajeLead: string,
  mensajeIA: string,
  contactId?: string
): Promise<ScoreMensajeGHL> {
  const traceId = randomUUID();
  const userContent = `MENSAJE DEL LEAD:\n${mensajeLead.slice(0, 500)}\n\nRESPUESTA GENERADA POR IA:\n${mensajeIA.slice(0, 800)}`;

  let raw = "";
  try {
    const resp = await callClaudeIA(
      "SCORE_MENSAJE_GHL",
      { max_tokens: 150, system: SYSTEM, messages: [{ role: "user", content: userContent }] },
      { traceId, leadId: contactId }
    );
    raw = (resp.content[0] as { text: string }).text.trim();
  } catch {
    return { score: 0.5, razon: "Error evaluando score — fallback neutro" };
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { score: 0.5, razon: "Respuesta IA malformada — fallback neutro" };

  try {
    const parsed = JSON.parse(match[0]) as { score: unknown; razon: unknown };
    const score = typeof parsed.score === "number"
      ? Math.min(1, Math.max(0, parsed.score))
      : 0.5;
    const razon = typeof parsed.razon === "string" ? parsed.razon : "Sin razon";
    return { score, razon };
  } catch {
    return { score: 0.5, razon: "JSON inválido — fallback neutro" };
  }
}
