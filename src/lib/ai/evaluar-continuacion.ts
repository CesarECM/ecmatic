// MPS-26 S100 — Haiku evalúa si tiene sentido continuar el ciclo de follow-up.
// Evita llegar siempre al max_intentos cuando hay señales claras de desenganche.
// max_intentos en followup_config sigue siendo el techo absoluto — este módulo
// puede detener antes, pero nunca forzar más intentos de los configurados.
import { callClaudeIA } from "./client";
import { logSistema } from "@/services/log-sistema";

export type DecisionContinuacion = "continuar" | "pausar" | "escalar";

export interface ResultadoContinuacion {
  decision: DecisionContinuacion;
  razon: string;
}

// Señales de desenganche que indican pausa temprana:
// - Respuestas negativas explícitas ("no me interesa", "ya no")
// - Bloqueos o reportes de spam
// - Más de N intentos sin ningún tipo de respuesta
// - Lead archivado en ECMatic

export async function evaluarContinuacion(params: {
  historial: string | null;
  angulosUsados: string[];  // códigos de ángulos ya probados con este lead
  nivel: number;            // nivel actual (número de intentos realizados)
  tipo: string;
  leadId?: string;
  traceId?: string;
}): Promise<ResultadoContinuacion> {
  const { historial, angulosUsados, nivel, tipo, leadId, traceId } = params;

  // Con menos de 2 intentos, siempre continuar sin llamar a IA
  if (nivel < 2) return { decision: "continuar", razon: "nivel_inicial" };

  // Sin historial y muchos intentos: pausar para no molestar
  if (!historial && nivel >= 4) {
    return { decision: "pausar", razon: "sin_historial_nivel_avanzado" };
  }

  const system = `Eres un evaluador de ciclos de seguimiento de ventas B2C por WhatsApp.
Tu tarea: decidir si continuar intentando contactar al lead, pausar el ciclo automático o escalar a un humano.

Analiza:
1. Si el lead respondió algo (aunque sea brevemente)
2. Si hay señales explícitas de desinterés, bloqueo o rechazo
3. Si el historial muestra progreso o retroceso
4. Si ya se probaron muchos ángulos sin resultado

RESPONDE EXACTAMENTE EN ESTE FORMATO JSON (sin markdown, sin explicación adicional):
{"decision":"continuar|pausar|escalar","razon":"<una línea corta explicando por qué>"}

- continuar: aún hay esperanza razonable, seguir intentando
- pausar: señales de desenganche, detener el ciclo automático
- escalar: el lead mostró intención pero necesita atención humana urgente`;

  const userContent = `TIPO DE SEGUIMIENTO: ${tipo}
NIVEL ACTUAL (intentos realizados): ${nivel}
ÁNGULOS YA PROBADOS: ${angulosUsados.join(", ") || "ninguno"}

HISTORIAL RECIENTE:
${historial ?? "(sin mensajes registrados)"}`;

  try {
    const resp = await callClaudeIA(
      "EVALUAR_CONTINUACION",
      {
        max_tokens: 80,
        system,
        messages: [{ role: "user", content: userContent }],
      },
      { leadId, traceId },
    );

    const block = resp.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;

    if (!block?.text) return { decision: "continuar", razon: "sin_respuesta_ia" };

    const parsed = JSON.parse(block.text.trim()) as {
      decision?: string;
      razon?: string;
    };

    const decision = (["continuar", "pausar", "escalar"].includes(parsed.decision ?? ""))
      ? (parsed.decision as DecisionContinuacion)
      : "continuar";

    void logSistema({
      categoria: "ia", tipoAccion: "seguimiento.evaluacion_continuacion", fase: "ok",
      leadId, traceId,
      resultado: `${decision}: ${parsed.razon ?? ""}`,
      metadata:  { tipo, nivel, angulosUsados, decision },
    });

    return { decision, razon: parsed.razon ?? "ia_decision" };
  } catch (err) {
    // En caso de error, continuar (safe default — max_intentos sigue siendo el techo)
    void logSistema({
      categoria: "ia", tipoAccion: "seguimiento.evaluacion_continuacion", fase: "error",
      leadId, traceId, resultado: String(err).slice(0, 200),
    });
    return { decision: "continuar", razon: "error_ia_fallback" };
  }
}
