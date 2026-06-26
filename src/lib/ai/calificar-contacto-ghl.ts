import { randomUUID } from "crypto";
import { callClaudeIA } from "./client";

export type CategoriaSBC =
  | "ecm_sbc_ya_compro"   // ya adquirió SmartBuilderEC o EC0217 — excluir
  | "ecm_sbc_descartado"  // dijo no explícitamente — blacklist
  | "ecm_sbc_caliente"    // interés activo, listo para cerrar — Workflow A
  | "ecm_sbc_tibio"       // interactuó pero sin resolución — Workflow B
  | "ecm_sbc_sin_hist";   // sin historial de conversación — Workflow B (educativo)

interface CalificacionResult {
  categoria: CategoriaSBC;
  razon: string;
}

const SYSTEM = `Eres el clasificador de leads de Centro ECM (ceecm.mx), un centro de certificación CONOCER en México.
Tu tarea: analizar el historial de conversación WhatsApp de un contacto y clasificarlo para la campaña SmartBuilderEC.

SmartBuilderEC es un servicio de alineación EC0217.01 ($1,799 MXN). El contacto recibió información sobre esto antes.

Categorías (elige UNA):
- "ecm_sbc_ya_compro"  → Ya compró SmartBuilderEC, EC0217.01, o mencionó tener su certificación completa.
- "ecm_sbc_descartado" → Dijo explícitamente que NO le interesa, que ya no quiere, que canceló, o fue grosero.
- "ecm_sbc_caliente"   → Mostró interés activo reciente: preguntó precio, pidió info, dijo que sí, o tiene urgencia.
- "ecm_sbc_tibio"      → Tuvo conversación previa pero sin resolución clara: interesado pero sin avanzar, o respuestas vagas.
- "ecm_sbc_sin_hist"   → Sin historial de conversación o conversación sin relevancia para EC0217.

Responde SOLO en JSON (sin texto extra):
{
  "categoria": "ecm_sbc_caliente",
  "razon": "Preguntó el precio y dijo que quería hacerlo este mes"
}`;

export async function calificarContactoGHL(
  historial: string,
  contactId?: string
): Promise<CalificacionResult> {
  if (!historial.trim()) {
    return { categoria: "ecm_sbc_sin_hist", razon: "Sin historial de conversación" };
  }

  const traceId = randomUUID();
  const userContent = `Historial de conversación WhatsApp:\n\n${historial.slice(0, 3000)}`;

  let raw = "";
  try {
    const resp = await callClaudeIA(
      "CALIFICAR_CONTACTO_GHL",
      { max_tokens: 200, system: SYSTEM, messages: [{ role: "user", content: userContent }] },
      { traceId, leadId: contactId }
    );
    raw = (resp.content[0] as { text: string }).text.trim();
  } catch {
    return { categoria: "ecm_sbc_tibio", razon: "Error IA — fallback tibio" };
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { categoria: "ecm_sbc_tibio", razon: "Respuesta IA malformada" };

  try {
    const parsed = JSON.parse(match[0]) as CalificacionResult;
    const categorias: CategoriaSBC[] = [
      "ecm_sbc_ya_compro", "ecm_sbc_descartado",
      "ecm_sbc_caliente", "ecm_sbc_tibio", "ecm_sbc_sin_hist",
    ];
    if (!categorias.includes(parsed.categoria)) {
      return { categoria: "ecm_sbc_tibio", razon: parsed.razon ?? "Categoría inválida — fallback" };
    }
    return { categoria: parsed.categoria, razon: parsed.razon ?? "" };
  } catch {
    return { categoria: "ecm_sbc_tibio", razon: "JSON inválido — fallback tibio" };
  }
}

export function formatearHistorialGHL(
  mensajes: { direction: string; body?: string; text?: string; dateAdded: string }[]
): string {
  if (!mensajes.length) return "";
  return mensajes
    .slice(-30) // últimos 30 mensajes
    .map((m) => {
      const quien = m.direction === "inbound" ? "LEAD" : "CENTRO";
      const texto = (m.body ?? m.text ?? "").trim();
      const fecha = m.dateAdded.slice(0, 10);
      return `[${fecha}] ${quien}: ${texto}`;
    })
    .filter((l) => l.includes(": ") && !l.endsWith(": "))
    .join("\n");
}
