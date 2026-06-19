import { anthropic, CLAUDE_MODEL } from "./client";
import { registrarUsoIA } from "@/services/alertas-ia";
import type { IntencionClasificada } from "@/lib/supabase/types";

// S11.1 — 7 categorías de intención con árbol de respuesta dedicado
const INTENCIONES_V2 = [
  "compra_inmediata",
  "compra_consideracion",
  "duda_tecnica",
  "objecion_precio",
  "objecion_confianza",
  "abandono_inminente",
  "fuera_de_contexto",
] as const;

// Árbol de respuesta: define el tono y objetivo por intención
export const ARBOL_RESPUESTA: Record<string, { tono: string; objetivo: string }> = {
  compra_inmediata:    { tono: "urgente y facilitador", objetivo: "Enviar link de pago de inmediato" },
  compra_consideracion:{ tono: "informativo y paciente", objetivo: "Resolver dudas y nutrir sin presionar" },
  duda_tecnica:        { tono: "experto y claro",       objetivo: "Responder con precisión usando KB" },
  objecion_precio:     { tono: "empático y propositivo", objetivo: "Mostrar valor y opciones de pago" },
  objecion_confianza:  { tono: "transparente y validador", objetivo: "Presentar credenciales y testimonios" },
  abandono_inminente:  { tono: "activador de urgencia", objetivo: "Usar gatillo mental activo para retener" },
  fuera_de_contexto:   { tono: "amigable y redirector",  objetivo: "Redirigir al tema de certificación" },
  compra:              { tono: "urgente y facilitador", objetivo: "Enviar link de pago" }, // legacy
  otro:                { tono: "neutro",                objetivo: "Explorar necesidad" }, // legacy
};

export async function clasificarIntencion(
  mensajes: string[],
  historial: string
): Promise<IntencionClasificada> {
  const texto = mensajes.join("\n");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 15,
    system: `Eres un clasificador de intención de leads para un centro de certificación CONOCER en México.
Responde ÚNICAMENTE con una de estas palabras exactas (sin espacios adicionales):
compra_inmediata, compra_consideracion, duda_tecnica, objecion_precio, objecion_confianza, abandono_inminente, fuera_de_contexto

Definiciones:
- compra_inmediata: el lead quiere comprar ahora mismo ("¿cómo pago?", "quiero inscribirme")
- compra_consideracion: interesado pero necesita más información antes de decidir
- duda_tecnica: pregunta sobre el proceso, requisitos, o detalles de la certificación
- objecion_precio: menciona que es caro, pide descuento, o compara precios
- objecion_confianza: duda de la credibilidad del centro, pide referencias
- abandono_inminente: señales de que va a dejar la conversación o ya no está interesado
- fuera_de_contexto: pregunta que no tiene relación con certificaciones CONOCER`,
    messages: [
      {
        role: "user",
        content: `Historial previo:\n${historial || "(sin historial)"}\n\nMensaje(s) nuevo(s):\n${texto}\n\n¿Cuál es la intención principal?`,
      },
    ],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  const raw = (response.content[0] as { text: string }).text.trim().toLowerCase();
  const intencion = INTENCIONES_V2.find((i) => raw.includes(i));
  return (intencion ?? "fuera_de_contexto") as IntencionClasificada;
}
