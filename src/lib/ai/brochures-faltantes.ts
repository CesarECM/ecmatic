// S24.4 — Detecta servicios sin brochure que el patrón de conversaciones justifica crear.
// Recibe servicios candidatos + muestra de conversaciones recientes y devuelve cuáles necesitan brochure.

import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";

export interface ServicioCandidato {
  id: string;
  titulo: string;
  score_uso: number;
}

export interface BrochureSugerido {
  servicio_id: string;
  titulo_servicio: string;
  justificacion: string; // por qué el patrón de conversaciones lo justifica
}

const SYSTEM = `Eres un analista de marketing para un centro de certificación CONOCER.
Recibirás una lista de servicios que NO tienen brochure informativo creado, junto con
una muestra de conversaciones recientes con prospectos.

Tu tarea: identificar cuáles de esos servicios realmente necesitan un brochure,
basándote en evidencia concreta de las conversaciones (leads pidiendo más información,
preguntas repetidas sobre el mismo servicio, leads indecisos que pedirían material).

REGLAS:
- Solo sugiere servicios que aparezcan mencionados o inferidos en las conversaciones
- Si el patrón conversacional no justifica ningún brochure, devuelve array vacío
- Máximo 3 sugerencias por análisis
- Justificación breve (1 oración) con evidencia de las conversaciones
- Responde ÚNICAMENTE con JSON válido, sin texto adicional:
  { "sugerencias": [ { "servicio_id": "uuid", "titulo_servicio": "...", "justificacion": "..." } ] }`;

export async function detectarBrochuresFaltantes(
  serviciosSinBrochure: ServicioCandidato[],
  muestrasConversacion: string[]
): Promise<BrochureSugerido[]> {
  if (!serviciosSinBrochure.length || !muestrasConversacion.length) return [];

  const listaServicios = serviciosSinBrochure
    .map((s) => `• ID: ${s.id} | Servicio: ${s.titulo} | Veces usado en KB: ${s.score_uso}`)
    .join("\n");

  const userContent = `SERVICIOS SIN BROCHURE (${serviciosSinBrochure.length} servicios):
${listaServicios}

MUESTRA DE CONVERSACIONES RECIENTES (${muestrasConversacion.length} leads):
${muestrasConversacion.map((m, i) => `--- Lead ${i + 1} ---\n${m}`).join("\n\n")}

¿Cuáles de estos servicios necesitan un brochure basándote en las conversaciones?`;

  const response = await anthropic.messages.create({
    model:      modeloPorTarea("ANALISIS"),
    max_tokens: 500,
    system:     SYSTEM,
    messages:   [{ role: "user", content: userContent }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  try {
    const texto = (response.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(texto) as { sugerencias: BrochureSugerido[] };
    return Array.isArray(parsed.sugerencias) ? parsed.sugerencias.slice(0, 3) : [];
  } catch {
    return [];
  }
}
