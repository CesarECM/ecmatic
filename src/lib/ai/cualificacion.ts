import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";

export interface ResultadoCualificacion {
  califica: boolean;
  ejes: {
    capacidadInversion: boolean | null;
    compromisoTiempo: boolean | null;
    fitServicio: boolean | null;
  };
  razonDescalificacion: string | null;
  mensajeDesacuerdo: string | null; // texto para despedida amable cuando no califica
}

// S31.3 — Evalúa si el lead califica en los 3 ejes del Protocolo Setter fase 5
export async function evaluarCualificacion(
  mensajes: string[],
  historial: string,
  nombre: string | null,
  serviciosAncla: string[]
): Promise<ResultadoCualificacion> {
  const serviciosTexto = serviciosAncla.length
    ? serviciosAncla.join(", ")
    : "certificación CONOCER";

  const prompt = `Analiza esta conversación y evalúa si el lead califica para continuar el proceso de venta.

Servicio(s) que se ofrecen: ${serviciosTexto}
Nombre del lead: ${nombre ?? "desconocido"}

HISTORIAL:
${historial || "(sin historial)"}

ÚLTIMOS MENSAJES DEL LEAD:
${mensajes.join("\n")}

Evalúa los 3 ejes de cualificación y responde SOLO en JSON con este formato exacto:
{
  "capacidad_inversion": true/false/null,
  "compromiso_tiempo": true/false/null,
  "fit_servicio": true/false/null,
  "razon_descalificacion": "texto breve si no califica en algún eje, o null si califica en todos",
  "mensaje_despedida": "mensaje cálido de despedida para enviar al lead si no califica (máx 2 oraciones), o null si califica"
}

Reglas:
- capacidad_inversion: ¿el lead puede invertir en la certificación? (null si no hay información suficiente)
- compromiso_tiempo: ¿el lead tiene tiempo y disposición para el proceso? (null si no hay información)
- fit_servicio: ¿el servicio es apropiado para el perfil del lead? (null si no hay información)
- Si algún eje es false, el lead NO califica
- Si algún eje es null, asume que califica (dar el beneficio de la duda)
- El mensaje de despedida debe ser humano, empático, nunca condescendiente`;

  try {
    const response = await anthropic.messages.create({
      model: modeloPorTarea("CUALIFICACION"),
      max_tokens: 300,
      system: "Eres un experto en cualificación de leads para procesos de certificación profesional en México. Responde SOLO en JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

    const texto = (response.content[0] as { text: string }).text.trim();
    const json = JSON.parse(texto.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      capacidad_inversion?: boolean | null;
      compromiso_tiempo?: boolean | null;
      fit_servicio?: boolean | null;
      razon_descalificacion?: string | null;
      mensaje_despedida?: string | null;
    };

    const ejes = {
      capacidadInversion: json.capacidad_inversion ?? null,
      compromisoTiempo:   json.compromiso_tiempo   ?? null,
      fitServicio:        json.fit_servicio         ?? null,
    };

    const califica = Object.values(ejes).every((v) => v !== false);

    return {
      califica,
      ejes,
      razonDescalificacion: califica ? null : (json.razon_descalificacion ?? null),
      mensajeDesacuerdo:    califica ? null : (json.mensaje_despedida      ?? null),
    };
  } catch {
    // En caso de error, asumir que califica para no interrumpir el flujo
    return {
      califica: true,
      ejes: { capacidadInversion: null, compromisoTiempo: null, fitServicio: null },
      razonDescalificacion: null,
      mensajeDesacuerdo: null,
    };
  }
}
