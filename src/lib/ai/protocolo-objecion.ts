import type { TipoDesconfianza, TipoResistencia } from "@/lib/supabase/types";

export interface ProtocoloObjecion {
  tipoResistencia: TipoResistencia;
  tipoDesconfianza: TipoDesconfianza | null;
  instruccion: string; // bloque inyectado en el system prompt del motor de respuesta
}

// S31.6 — Protocolo: dar la razón primero, luego preguntas de reencuadre por tipo de desconfianza
// El lead debe llegar a su propia conclusión; nunca se impone la respuesta.

const REENCUADRES: Record<TipoDesconfianza, { darLaRazon: string; pregunta: string }> = {
  empresa: {
    darLaRazon: "Entiendo perfectamente que quieras asegurarte de que esto vale la pena antes de comprometerte.",
    pregunta: "¿Qué información o evidencia te daría más confianza en que el Centro ECM es la opción correcta para ti?",
  },
  profesional: {
    darLaRazon: "Tienes razón en querer saber con quién exactamente estarías trabajando.",
    pregunta: "¿Qué te gustaría saber de nuestro equipo o de mi experiencia para sentirte más cómodo/a avanzando?",
  },
  propia: {
    darLaRazon: "Es completamente normal tener esa duda; de hecho, la mayoría de personas que certificamos empezaron exactamente con esa misma preocupación.",
    pregunta: "¿Qué necesitarías ver o sentir para saber que tú sí puedes lograrlo?",
  },
};

// S31.6 — Construye el bloque de instrucción para el motor de respuesta
export function construirProtocoloObjecion(
  tipoResistencia: TipoResistencia,
  tipoDesconfianza: TipoDesconfianza | null,
  precioPreviamenteRevelado = true
): ProtocoloObjecion {
  // Objeción económica sin precio conocido: el lead asume un costo que no sabe
  if (tipoResistencia === "objecion" && !precioPreviamenteRevelado) {
    return {
      tipoResistencia,
      tipoDesconfianza: null,
      instruccion: [
        "OBJECIÓN ECONÓMICA — PRECIO NO REVELADO:",
        "El lead menciona no tener dinero, pero no conoce el precio real. Es una objeción asumida, no una condición real.",
        "Protocolo obligatorio (en orden):",
        "1. DA LA RAZÓN sin rendirte: \"Entiendo, uno siempre quiere saber si cabe en el presupuesto antes de avanzar.\"",
        "2. PREGUNTA DE REENCUADRE: \"¿Cuánto estás imaginando que podría costar algo así?\" — deja que el lead se autocalifique.",
        "3. ESCUCHA — no reveles el precio todavía. Si el lead dice un monto alto, confirma que es mucho más accesible.",
        "NUNCA propongas contactarlo 'más adelante' ni cierres la conversación sin aplicar este protocolo.",
      ].join("\n"),
    };
  }

  if (tipoResistencia === "condicion") {
    return {
      tipoResistencia,
      tipoDesconfianza: null,
      instruccion: [
        "RESISTENCIA DETECTADA: CONDICIÓN REAL",
        "El lead tiene una razón genuina que le impide comprar ahora mismo.",
        "NO intentes superar esta barrera. Acepta con respeto, expresa comprensión genuina,",
        "ofrece mantenerse en contacto, y cierra con calidez. Un 'no ahora' puede ser un 'sí después'.",
      ].join("\n"),
    };
  }

  if (!tipoDesconfianza) {
    return { tipoResistencia, tipoDesconfianza: null, instruccion: "" };
  }

  const reencuadre = REENCUADRES[tipoDesconfianza];

  return {
    tipoResistencia,
    tipoDesconfianza,
    instruccion: [
      `OBJECIÓN DETECTADA — DESCONFIANZA RAÍZ: ${tipoDesconfianza.toUpperCase()}`,
      "Protocolo de 3 pasos (seguir en orden):",
      `1. DA LA RAZÓN con esta frase o variación natural: "${reencuadre.darLaRazon}"`,
      `2. PREGUNTA DE REENCUADRE (úsala tal cual o adapta el tono): "${reencuadre.pregunta}"`,
      "3. ESCUCHA — no respondas la objeción directamente; deja que el lead llegue a su propia conclusión.",
      "NUNCA digas 'pero', 'sin embargo' ni invalides lo que el lead siente.",
    ].join("\n"),
  };
}
