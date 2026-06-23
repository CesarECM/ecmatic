import { callClaudeIA } from "./client";
import { logDebugIA } from "@/services/log-ia";
import type { Pipeline } from "@/services/pipelines-admin";
import type { EtapaAdmin } from "@/services/etapas-admin";

export type TipoCambioPipeline = "crear_pipeline" | "editar_pipeline" | "crear_etapa" | "editar_etapa" | "eliminar_etapa" | "scan_global";

export interface SugerenciaPipeline {
  accion: "crear" | "editar" | "unir" | "separar" | "eliminar" | "completar_campo" | "reorganizar";
  titulo: string;
  descripcion: string;
  pipeline_ruta: string;
  etapa_nombre?: string;
  urgencia: "alta" | "media" | "baja";
}

export async function auditarPipeline(
  pipeline: Pipeline,
  etapas: EtapaAdmin[],
  tipoCambio: TipoCambioPipeline
): Promise<SugerenciaPipeline[]> {
  const systemPrompt = `Eres el Auditor de Pipelines de ECMatic, un CRM para un centro de certificación CONOCER en México.
Tu trabajo es analizar la estructura de pipelines de venta y detectar problemas o mejoras.

Contexto del modelo CAGC (17 fases del comprador, 0-16):
0-Inconsciencia, 1-Activación, 2-Definición del problema, 3-Exploración inicial, 4-Consciencia de soluciones,
5-Construcción de criterios, 6-Evaluación de opciones, 7-Validación social, 8-Ansiedad pre-decisión,
9-Decisión de compra, 10-Acto de compra, 11-Disonancia post-compra, 12-Evaluación de experiencia,
13-Satisfacción/Insatisfacción, 14-Retención, 15-Lealtad, 16-Advocacy.

Reglas de negocio para pipelines de Centro ECM:
- Cada etapa DEBE tener SLA definido (máximo de días sin avance antes de alerta).
- Cada etapa DEBE tener al menos un canal de contacto habilitado.
- Etapas sin criterios de salida claros generan cuellos de botella.
- Etapas con fases_cagc vacías no pueden alinearse con el motor de conversación.
- Un gap mayor a 3 fases CAGC entre etapas consecutivas es una brecha de contenido.
- Si el pipeline cubre fases 8-10 sin etapa de "Negociación" o equivalente, falta manejo de ansiedad pre-decisión.
- Etapas sin plantillas de mensaje dependen 100% de la IA sin respaldo humano.
- Un pipeline con menos de 3 etapas activas raramente captura suficientes señales de conversión.

Responde SOLO en JSON con este formato:
{
  "sugerencias": [
    {
      "accion": "crear|editar|unir|separar|eliminar|completar_campo|reorganizar",
      "titulo": "Título claro de la sugerencia",
      "descripcion": "Descripción concreta y accionable de qué hacer y por qué",
      "pipeline_ruta": "ruta del pipeline afectado",
      "etapa_nombre": "nombre de etapa si aplica (opcional)",
      "urgencia": "alta|media|baja"
    }
  ]
}
Si no hay sugerencias, responde: {"sugerencias": []}`;

  const etapasSummary = etapas.map((e) => ({
    nombre:            e.nombre,
    orden:             e.orden,
    fases_cagc:        e.fases_cagc,
    es_tronco:         e.es_tronco,
    sla_dias:          e.sla_dias,
    rotting_dias:      e.rotting_dias,
    criterios_entrada: e.criterios_entrada,
    criterios_salida:  e.criterios_salida,
    canales:           e.canales,
    tareas:            e.tareas_obligatorias.length,
    plantillas:        e.plantillas_mensaje.length,
    workflow_reglas:   e.condiciones_workflow.length,
    etapas_siguientes: e.etapas_siguientes,
    tiene_protocolo:   !!e.protocolo?.regla_avance,
    activo:            e.activo,
  }));

  const userContent = `PIPELINE AUDITADO (acción: ${tipoCambio}):
Ruta: ${pipeline.ruta}
Nombre: ${pipeline.nombre}
Tipo: ${pipeline.tipo}
Servicio ancla: ${pipeline.servicio_id ?? "Sin servicio vinculado"}
Rango CAGC: ${pipeline.fase_cagc_inicio ?? "?"} → ${pipeline.fase_cagc_fin ?? "?"}
Descripción: ${pipeline.descripcion ?? "Sin descripción"}
Activo: ${pipeline.activo ? "Sí" : "No"}

ETAPAS (${etapas.length} total):
${JSON.stringify(etapasSummary, null, 2)}`;

  let raw = "";
  try {
    const resp = await callClaudeIA("SUGERIR_KB", {
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    raw = (resp.content[0] as { text: string }).text.trim();
    if (resp.stop_reason === "max_tokens") {
      void logDebugIA("AUDITOR_PIPELINE", `[MAX_TOKENS] Respuesta truncada — JSON probablemente inválido`, {
        stop_reason: resp.stop_reason, raw_tail: raw.slice(-200), pipeline_ruta: pipeline.ruta,
      }, "warn");
    }
  } catch (err) {
    await logDebugIA("AUDITOR_PIPELINE", `[CLAUDE_ERROR] callClaudeIA falló: ${String(err)}`, {
      error: String(err), pipeline_ruta: pipeline.ruta, tipoCambio,
    }, "error");
    return [];
  }

  // Claude puede envolver el JSON en ```json...``` y añadir texto antes/después.
  // Extraer el bloque JSON directamente con regex es más robusto que limpiar bordes.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleaned = jsonMatch ? jsonMatch[0] : raw.trim();

  void logDebugIA("AUDITOR_PIPELINE", `[PARSE_INICIO] ${cleaned.length} chars: ${cleaned.slice(0, 120)}`, {
    raw_preview: cleaned.slice(0, 600), raw_length: cleaned.length,
    raw_total: raw.length, extra_chars: raw.length - cleaned.length,
    pipeline_ruta: pipeline.ruta,
  });

  try {
    const json = JSON.parse(cleaned) as { sugerencias: SugerenciaPipeline[] };
    const count = json.sugerencias?.length ?? 0;
    void logDebugIA("AUDITOR_PIPELINE", `[PARSE_OK] ${count} sugerencias`, {
      count, titulos: (json.sugerencias ?? []).map(s => s.titulo),
    });
    return json.sugerencias ?? [];
  } catch (err) {
    await logDebugIA("AUDITOR_PIPELINE", `[PARSE_ERROR] JSON.parse falló: ${String(err)}`, {
      raw_preview: cleaned.slice(0, 600), error: String(err), pipeline_ruta: pipeline.ruta,
    }, "error");
    return [];
  }
}
