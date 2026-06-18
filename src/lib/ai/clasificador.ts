import { anthropic, CLAUDE_MODEL } from "./client";
import type { IntencionClasificada } from "@/lib/supabase/types";

const INTENCIONES = [
  "compra",
  "duda_tecnica",
  "objecion_precio",
  "abandono_inminente",
  "otro",
] as const;

export async function clasificarIntencion(
  mensajes: string[],
  historial: string
): Promise<IntencionClasificada> {
  const texto = mensajes.join("\n");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 10,
    system: `Eres un clasificador de intención de leads para un centro de certificación CONOCER.
Responde ÚNICAMENTE con una de estas palabras exactas: compra, duda_tecnica, objecion_precio, abandono_inminente, otro.
No agregues nada más.`,
    messages: [
      {
        role: "user",
        content: `Historial previo:\n${historial || "(sin historial)"}\n\nMensaje(s) nuevo(s):\n${texto}\n\n¿Cuál es la intención principal?`,
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim().toLowerCase();
  const intencion = INTENCIONES.find((i) => raw.includes(i));
  return intencion ?? "otro";
}
