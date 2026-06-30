// Guardrails de precio: detecta descuentos no autorizados e intentos de prompt injection.
// Función pura sin llamadas a IA — determinista y sin riesgo de loop.

const PATRONES_DESCUENTO: RegExp[] = [
  /te\s+lo\s+dejo\s+en/i,
  /hacerte?\s+(un\s+)?descuento/i,
  /precio\s+especial\s+para\s+ti/i,
  /solo\s+por\s+hoy\s+te\s+(doy|ofrezco|pongo)/i,
  /\d+\s*%\s+de\s+(descuento|rebaja)/i,
  /te\s+(hago|aplico|doy)\s+(una?\s+)?rebaja/i,
];

const PATRONES_INYECCION: RegExp[] = [
  /ignora\s+(las?\s+|tus\s+)?instrucciones/i,
  /olvida\s+(lo\s+anterior|tus\s+instrucciones)/i,
  /act[uú]a\s+como\s+(si\s+)?fueras/i,
  /nuevo\s+(rol|sistema|prompt|contexto)/i,
  /\[sistema\]/i,
  /<\s*system\s*>/i,
  /DAN\s+mode/i,
];

export type TipoViolacion = "descuento" | "inyeccion";

export interface ViolacionGuardrail {
  tipo: TipoViolacion;
  detalle: string;
}

export function detectarViolacion(
  respuestaIA: string,
  mensajeEntrada: string,
): ViolacionGuardrail | null {
  // Inyección: el ataque viene del mensaje del lead
  for (const patron of PATRONES_INYECCION) {
    if (patron.test(mensajeEntrada)) {
      return { tipo: "inyeccion", detalle: mensajeEntrada.slice(0, 120) };
    }
  }

  // Descuento no autorizado: la IA lo generó en la respuesta
  for (const patron of PATRONES_DESCUENTO) {
    if (patron.test(respuestaIA)) {
      return { tipo: "descuento", detalle: respuestaIA.slice(0, 120) };
    }
  }

  return null;
}
