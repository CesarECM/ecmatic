import { randomUUID } from "crypto";
import { callClaudeIA } from "./client";

export interface ClasificacionWorkflow {
  resumen_ia:      string;
  clasificacion:   "keep" | "rescue" | "delete";
  tags_detectados: string[];
}

const SYSTEM = `Eres el auditor de automatizaciones de GoHighLevel (GHL) de Centro ECM, un centro de certificación CONOCER en México.
Tu tarea es analizar workflows de GHL y clasificarlos para decidir cuáles conservar, rescatar o eliminar.

Centro ECM usa ECMatic (CRM propio con IA) para la conversación inteligente con leads vía WhatsApp y Claude AI.
GHL se usa para: campañas de email/SMS masivas, nurturing automatizado, pipelines de oportunidades y workflows de seguimiento.

Clasificaciones válidas:
- "keep"   → Workflow activo, funcional y alineado con los procesos actuales. Mantener.
- "rescue" → Workflow con potencial pero incompleto, desactualizado o en borrador sin revisar. Revisar y corregir.
- "delete" → Workflow obsoleto, duplicado, sin propósito claro o que contradice la arquitectura actual.

Responde SOLO en JSON con este formato exacto (sin texto extra):
{
  "resumen_ia": "Descripción en 1-2 oraciones de qué hace este workflow y para qué sirve",
  "clasificacion": "keep|rescue|delete",
  "tags_detectados": ["tag1", "tag2"]
}

Tags detectables (usa los que apliquen): whatsapp, email, sms, claude_ai, n8n, pipeline, leads, nurturing, agendamiento, bot, filtro, seguimiento, reactivacion, facebook, google_ads, webhook, ecmatic, calificacion, pago, onboarding, post_venta`;

export async function clasificarWorkflow(
  nombre: string,
  status: "draft" | "published"
): Promise<ClasificacionWorkflow> {
  const traceId = randomUUID();

  const userContent = `Workflow GHL a analizar:
Nombre: ${nombre}
Estado: ${status === "published" ? "publicado (activo)" : "borrador (inactivo)"}`;

  let raw = "";
  try {
    const resp = await callClaudeIA("CLASIFICAR_WORKFLOW", {
      max_tokens: 400,
      system:     SYSTEM,
      messages:   [{ role: "user", content: userContent }],
    }, { traceId });
    raw = (resp.content[0] as { text: string }).text.trim();
  } catch {
    return fallback(nombre, status);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback(nombre, status);

  try {
    const parsed = JSON.parse(match[0]) as ClasificacionWorkflow;
    if (!["keep", "rescue", "delete"].includes(parsed.clasificacion)) {
      parsed.clasificacion = "rescue";
    }
    return {
      resumen_ia:      parsed.resumen_ia ?? nombre,
      clasificacion:   parsed.clasificacion,
      tags_detectados: Array.isArray(parsed.tags_detectados) ? parsed.tags_detectados : [],
    };
  } catch {
    return fallback(nombre, status);
  }
}

function fallback(nombre: string, status: "draft" | "published"): ClasificacionWorkflow {
  return {
    resumen_ia:      `Workflow: ${nombre}`,
    clasificacion:   status === "published" ? "keep" : "rescue",
    tags_detectados: [],
  };
}
