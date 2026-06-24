// Detecta cuándo la IA debe revelar el nombre del servicio al lead.
// Corre en paralelo con el setter y el clasificador en cada turno de conversación.
import { callClaudeIA } from "./client";

export type ModoRevelacion = "oculto" | "preguntando" | "revelado";

export type SeñalRevelacion =
  | "listo_para_preguntar"  // lead reconoció su dolor; IA debe preguntar si quiere saber el producto
  | "pide_servicio"         // lead pregunta directamente por servicio, certificado o precio
  | "confirma_interes"      // lead responde positivo a la pregunta de la IA
  | "rechaza_conocer"       // lead niega o evade cuando la IA ya preguntó
  | null;

// Transiciones unidireccionales. Llamar antes de pasarlo al motor.
export function calcularNuevoModo(
  actual: ModoRevelacion,
  señal: SeñalRevelacion | null
): ModoRevelacion {
  if (actual === "revelado") return "revelado";
  if (señal === "pide_servicio") return "revelado";
  if (señal === "confirma_interes" && actual === "preguntando") return "revelado";
  if (señal === "listo_para_preguntar" && actual === "oculto") return "preguntando";
  return actual;
}

const VALIDOS: SeñalRevelacion[] = [
  "listo_para_preguntar",
  "pide_servicio",
  "confirma_interes",
  "rechaza_conocer",
];

export async function detectarRevelacion(
  mensajes: string[],
  historial: string,
  modoActual: ModoRevelacion,
  meta?: { leadId?: string; traceId?: string }
): Promise<SeñalRevelacion> {
  const contexto =
    modoActual === "preguntando"
      ? "La IA YA preguntó al lead si quiere saber qué servicio le puede ayudar. Clasifica la respuesta del lead."
      : "La IA AÚN NO ha preguntado sobre el servicio. Clasifica si el lead reconoció su problema y está listo para avanzar.";

  const r = await callClaudeIA(
    "DETECTOR_REVELACION",
    {
      max_tokens: 20,
      system: `Clasificas la señal del lead en una conversación de ventas de certificaciones CONOCER en México.
${contexto}

Responde con UNO de estos valores exactos y nada más:
- "listo_para_preguntar" — lead reconoció su problema/dolor y muestra apertura, pero no pidió el producto
- "pide_servicio" — lead pregunta explícitamente por un servicio, certificado, estándar o precio
- "confirma_interes" — lead responde positivo a la pregunta de la IA ("sí", "claro", "dime", "¿cuál?")
- "rechaza_conocer" — lead niega, evade o cambia el tema cuando la IA ya le preguntó
- "null" — mensaje neutral, continuar con el protocolo de descubrimiento`,
      messages: [
        {
          role: "user",
          content: `Historial:\n${historial || "(primera interacción)"}\n\nMensaje actual:\n${mensajes.join("\n")}`,
        },
      ],
    },
    meta
  );

  const texto = ((r.content[0] as { text: string }).text).trim().replace(/^"|"$/g, "");
  return VALIDOS.includes(texto as SeñalRevelacion) ? (texto as SeñalRevelacion) : null;
}
