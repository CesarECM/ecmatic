import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUsoIA } from "@/services/alertas-ia";

export interface EstadoSetter {
  faseActual: number;
  nombreFase: string;
  descripcionFase: string;
  preguntaGuia: string;
  debeAvanzar: boolean;
  faseNueva: number;
}

interface SetterFaseRow {
  orden: number;
  nombre: string;
  descripcion: string;
  regla_avance: string;
  preguntas_guia: string[];
}

// S31.2 — Evalúa si el lead avanzó de fase setter y devuelve contexto para el motor
export async function evaluarFaseSetter(
  faseActual: number,
  mensajes: string[],
  historial: string,
  temperamento: string | null
): Promise<EstadoSetter> {
  const supabase = createServiceClient();

  const ordenesABuscar = faseActual < 6
    ? [faseActual, faseActual + 1]
    : [faseActual];

  const { data: fases } = await supabase
    .from("setter_fases")
    .select("orden, nombre, descripcion, regla_avance, preguntas_guia")
    .in("orden", ordenesABuscar)
    .eq("activo", true)
    .order("orden");

  const faseInfo = (fases as SetterFaseRow[] | null)?.find((f) => f.orden === faseActual);

  if (!faseInfo) {
    return { faseActual, nombreFase: "", descripcionFase: "", preguntaGuia: "", debeAvanzar: false, faseNueva: faseActual };
  }

  if (faseActual >= 6) {
    const pregunta = elegirPregunta(faseInfo.preguntas_guia, temperamento);
    return { faseActual, nombreFase: faseInfo.nombre, descripcionFase: faseInfo.descripcion, preguntaGuia: pregunta, debeAvanzar: false, faseNueva: 6 };
  }

  const response = await anthropic.messages.create({
    model: modeloPorTarea("SETTER"),
    max_tokens: 5,
    system: "Eres un evaluador de protocolo de ventas. Responde ÚNICAMENTE con SI o NO.",
    messages: [{
      role: "user",
      content: `FASE ACTUAL (${faseActual}): ${faseInfo.nombre}
REGLA DE AVANCE: ${faseInfo.regla_avance}
HISTORIAL: ${historial || "(primera interacción)"}
ÚLTIMO MENSAJE DEL LEAD: ${mensajes.join("\n")}

¿Ha cumplido el lead la regla de avance? Responde solo: SI o NO`,
    }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  const debeAvanzar = (response.content[0] as { text: string }).text.trim().toUpperCase().startsWith("S");
  const faseNueva = debeAvanzar ? faseActual + 1 : faseActual;

  const faseMostrar = debeAvanzar
    ? ((fases as SetterFaseRow[] | null)?.find((f) => f.orden === faseNueva) ?? faseInfo)
    : faseInfo;

  const preguntaGuia = elegirPregunta(faseMostrar.preguntas_guia, temperamento);

  return {
    faseActual,
    nombreFase: faseMostrar.nombre,
    descripcionFase: faseMostrar.descripcion,
    preguntaGuia,
    debeAvanzar,
    faseNueva,
  };
}

// Elige la pregunta guía adaptada al temperamento DISC
function elegirPregunta(preguntas: string[], temperamento: string | null): string {
  if (!preguntas.length) return "";
  // D/I prefieren la segunda pregunta (más directa/emotiva); S/C prefieren la primera (más reflexiva)
  if ((temperamento === "D" || temperamento === "I") && preguntas.length > 1) return preguntas[1];
  return preguntas[0];
}
