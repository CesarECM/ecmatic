// Detección de handoff humano. Extraído de motor-respuesta.ts.

const INDICADORES_HANDOFF = [
  "no tengo información",
  "no puedo ayudarte",
  "no sé",
  "un asesor",
  "te contactará",
  "fuera de mi alcance",
];

export async function necesitaHandoff(
  _mensajes: string[],
  respuestaGenerada: string
): Promise<boolean> {
  return INDICADORES_HANDOFF.some((i) => respuestaGenerada.toLowerCase().includes(i));
}
