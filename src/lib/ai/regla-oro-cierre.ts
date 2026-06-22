// S31.8 — Regla de Oro del Cierre
// En toda pausa natural de conversación, antes de quedarse pasiva,
// la IA sondea con una de estas dos frases obligatorias.
// Estas señales alimentan el motor de intención y el score de confianza (S31.9).

const SONDEOS = [
  "¿Esto que te comparto te hace sentido?",
  "¿Cuál sería el siguiente paso que te gustaría dar?",
] as const;

// Detecta si la conversación está en una "pausa natural" donde aplicar el sondeo
// Condición: respuesta del lead corta (≤10 palabras) sin intención clara
export function esPausaNatural(mensajes: string[], intencion: string): boolean {
  const INTENCIONES_ACTIVAS = new Set([
    "compra_inmediata",
    "quiere_agendar",
    "confirmando_slot",
  ]);
  if (INTENCIONES_ACTIVAS.has(intencion)) return false;

  const texto = mensajes.join(" ").trim();
  const palabras = texto.split(/\s+/).length;
  return palabras <= 10;
}

// Devuelve el sondeo adecuado según la fase de la conversación
// Setter fase < 5: usa sondeo de comprensión. Fase >= 5 o closer: usa sondeo de acción.
export function seleccionarSondeo(setterFase: number, esCloser: boolean): string {
  return (esCloser || setterFase >= 5) ? SONDEOS[1] : SONDEOS[0];
}

// Construye el bloque de instrucción fija para el motor de respuesta (S31.8)
export function instruccionReglaOroCierre(): string {
  return [
    "\nREGLA DE ORO DEL CIERRE (obligatoria en toda conversación activa):",
    "Cuando haya una pausa natural — respuesta corta, sin pregunta explícita, baja energía —",
    "incluye al final de tu respuesta UNA de estas dos frases (elige la más natural según contexto):",
    `• "${SONDEOS[0]}"`,
    `• "${SONDEOS[1]}"`,
    "NUNCA abandones una conversación activa sin intentar este sondeo.",
    "La respuesta del lead a este sondeo es una señal de intención de alta confianza.",
  ].join("\n");
}
