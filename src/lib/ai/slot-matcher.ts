import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import type { SlotDisponible } from "@/services/citas";

// Usa haiku para detectar cuál slot eligió el lead según su mensaje
export async function detectarSlotSeleccionado(
  mensajeLead: string,
  slots: SlotDisponible[]
): Promise<SlotDisponible | null> {
  if (!slots.length) return null;

  const listaSlots = slots.map((s, i) => {
    const fecha = s.inicio.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const hora  = s.inicio.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    return `${i + 1}. ${fecha} a las ${hora}`;
  }).join("\n");

  const response = await anthropic.messages.create({
    model: modeloPorTarea("CLASIFICAR"),
    max_tokens: 5,
    system: `El usuario seleccionó un horario de una lista. Responde SOLO con el número (1, 2 o 3) del horario elegido, o "0" si no eligió ninguno con claridad.

Horarios ofrecidos:
${listaSlots}`,
    messages: [{ role: "user", content: mensajeLead }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  const idx = parseInt(raw, 10) - 1;
  return idx >= 0 && idx < slots.length ? slots[idx] : null;
}
