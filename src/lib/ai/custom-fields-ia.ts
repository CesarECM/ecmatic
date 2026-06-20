// S20.6 — Detecta patrones de datos en conversaciones que no tienen campo propio en el CRM.
// Analiza muestras de múltiples leads y propone custom fields a capturar.

import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";

export interface CampoSugerido {
  nombre_campo: string;   // snake_case, ej. "empresa_empleadora"
  descripcion:  string;   // qué dato representa
  tipo_dato:    string;   // "texto" | "numero" | "fecha" | "booleano" | "lista"
  ejemplos:     string[]; // valores reales extraídos de conversaciones
}

const CAMPOS_EXISTENTES = `
nombre, telefono, email, canal_origen, pipeline_stage, pipeline_ruta,
temperamento (D/I/S/C), avatar, score_salud, compra_previa,
fase_cagc (0-16 etapas del comprador), etiquetas categorizadas,
señales situacionales (urgencia_laboral, fecha_limite, tercero_influyente, presupuesto_limitado),
leadmagnets ofrecidos, pipelines activos (tripwire y premium)
`.trim();

const SYSTEM = `Eres un analista de CRM especializado en identificar datos útiles no capturados.
Recibirás fragmentos de conversaciones reales (anonimizadas) con prospectos de certificación CONOCER.
Tu tarea es detectar patrones de datos que aparecen en MÚLTIPLES conversaciones y que NO tienen
un campo dedicado en el CRM.

Campos que YA existen y NO debes sugerir:
${CAMPOS_EXISTENTES}

REGLAS:
- Solo sugiere campos que aparezcan en al menos 2 de las conversaciones
- El nombre_campo debe ser snake_case, descriptivo y corto (máx 30 chars)
- Si no detectas ningún patrón relevante, devuelve un array vacío
- Máximo 5 sugerencias por análisis
- Responde ÚNICAMENTE con JSON válido, sin texto adicional:
  { "campos": [ { "nombre_campo", "descripcion", "tipo_dato", "ejemplos" } ] }`;

export async function detectarCustomFieldsSugeridos(
  muestrasConversacion: string[]
): Promise<CampoSugerido[]> {
  if (!muestrasConversacion.length) return [];

  const userContent = `MUESTRAS DE CONVERSACIONES (${muestrasConversacion.length} leads distintos):\n\n` +
    muestrasConversacion.map((m, i) => `--- Lead ${i + 1} ---\n${m}`).join("\n\n");

  const modelo = modeloPorTarea("ANALISIS");
  const response = await anthropic.messages.create({
    model:      modelo,
    max_tokens: 600,
    system:     SYSTEM,
    messages:   [{ role: "user", content: userContent }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  try {
    const texto = (response.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(texto) as { campos: CampoSugerido[] };
    return Array.isArray(parsed.campos) ? parsed.campos.slice(0, 5) : [];
  } catch {
    return [];
  }
}
