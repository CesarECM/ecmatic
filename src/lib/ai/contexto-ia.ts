// S23.1 — Motor de IA para el campo Contexto del lead
import { callClaudeIA } from "./client";
import type { EntradaContexto } from "@/lib/supabase/types";

interface DatosParaContexto {
  nombre: string | null;
  pipeline_stage: string;
  fase_cagc?: number;
  etiquetas?: string[];
}

// S23.3 — Genera actualización incremental del Contexto ante una acción sobre el lead
export async function generarActualizacionContexto(
  contextoActual: string | null,
  accion: string,
  datos: DatosParaContexto
): Promise<string> {
  const etiquetasLinea = datos.etiquetas?.length
    ? ` · Tags: ${datos.etiquetas.join(", ")}`
    : "";
  const faseLinea = datos.fase_cagc !== undefined ? ` · CAGC: ${datos.fase_cagc}` : "";

  const response = await callClaudeIA("CONTEXTO", {
    max_tokens: 250,
    system: `Eres el motor de contexto de ECMatic. Mantienes la capa interpretativa de un lead de certificación CONOCER.
El Contexto es analítico y conciso: situación actual, intención inferida, objeción dominante y próxima oportunidad de cierre.
No repitas eventos (eso lo hace el Timeline). Actualiza de forma incremental: preserva lo vigente, actualiza lo que cambió.
Máximo 120 palabras. Sin bullets ni listas.`,
    messages: [{
      role: "user",
      content: `Contexto actual: ${contextoActual ?? "(sin contexto previo)"}

Acción: ${accion}
Lead: ${datos.nombre ?? "desconocido"} · Etapa: ${datos.pipeline_stage}${faseLinea}${etiquetasLinea}

Actualiza el Contexto.`,
    }],
  });
  return (response.content[0] as { text: string }).text.trim();
}

// S23.4 — Sub-resumen comprimido cuando el historial supera el umbral
export async function generarSubresumenContexto(historial: EntradaContexto[]): Promise<string> {
  const bloques = historial
    .map((e) => `[${e.timestamp.slice(0, 10)} · ${e.origen}${e.accion ? ` · ${e.accion}` : ""}] ${e.contenido}`)
    .join("\n\n");

  const response = await callClaudeIA("CONTEXTO", {
    max_tokens: 200,
    system: `Genera un sub-resumen comprimido del historial de versiones del Contexto de un lead.
Captura los hitos clave: cómo llegó, objeciones transitadas, avances y qué sigue siendo relevante hoy.
100 palabras máximo. Sin fechas individuales. Sin bullets.`,
    messages: [{ role: "user", content: bloques }],
  });
  return (response.content[0] as { text: string }).text.trim();
}
