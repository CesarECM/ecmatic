import { randomUUID } from "crypto";
import { callClaudeIA } from "./client";

export interface DecisionTagsGHL {
  tagsAgregar: string[];
  tagsRemover: string[];
  stageKey: string | null;
  razon: string;
}

const SYSTEM = `Eres el motor de clasificación de ECMatic para Centro ECM (ceecm.mx), centro de certificación CONOCER/EC0217.01 en México.

Tu tarea: dado el mensaje de un lead y sus tags actuales, decide qué tags GHL agregar/remover y a qué etapa del pipeline moverlo.

## Taxonomía de tags permitidos (SOLO estos)
- Intención: int_sbc, int_manual, int_demo, int_otro_estandar
- Producto: prod_sbc, prod_manual
- Certificación: cert_ec0217_proceso, cert_ec0217_listo, cert_ec0217_completo
- Segmento: seg_caliente, seg_tibio, seg_frio, seg_dormido
- Estado: est_activo, est_reactivar
- Fuente: src_campana_ghl

NO modificar tags que empiecen con ecm_ (legacy).
NO agregar est_nuevo, est_blacklist, est_perdido_* (son automáticos).
NO inventar tags fuera de la lista.
Si un tag ya está en los actuales, no lo incluyas en tagsAgregar.

## Etapas válidas de pipeline (stageKey)
prospecto_nuevo | contactado | calificado | interesado_sbc | demo_agendada |
propuesta_enviada | negociacion | ganado_sbc | ganado_manual | en_certificacion |
certificado | reactivar

## Reglas de decisión
- Primera respuesta positiva → est_activo + contactado (si no tiene ya etapa superior)
- Pregunta por precio o costo → seg_caliente, int_sbc → interesado_sbc
- Pide más información sobre SBC → int_sbc → calificado o interesado_sbc
- Quiere demo o reunión → int_demo → demo_agendada
- Acepta propuesta / quiere pagar → seg_caliente → propuesta_enviada
- Está comparando o negociando → negociacion
- Confirma compra SBC → prod_sbc → ganado_sbc
- Ya tiene evidencias listas → cert_ec0217_listo
- En proceso de certificación → cert_ec0217_proceso → en_certificacion
- Respuesta tibia, sin urgencia → seg_tibio
- Solo mover a etapas superiores; si stageKey ya es superior, devuelve null
- Si no hay señal clara de etapa → stageKey: null

Responde SOLO en JSON sin markdown:
{"tagsAgregar":["seg_caliente","int_sbc"],"tagsRemover":["seg_frio"],"stageKey":"interesado_sbc","razon":"Pregunta directa por precio indica interés caliente en SBC"}`;

const FALLBACK: DecisionTagsGHL = {
  tagsAgregar: ["est_activo"],
  tagsRemover: [],
  stageKey: "contactado",
  razon: "Fallback: respuesta positiva sin clasificación específica",
};

export async function determinarTagsGHL(params: {
  mensajeLead: string;
  intencion: string;
  tagsActuales: string[];
  contactId?: string;
}): Promise<DecisionTagsGHL> {
  const userContent =
    `TAGS ACTUALES: ${params.tagsActuales.join(", ") || "ninguno"}\n` +
    `INTENCIÓN: ${params.intencion}\n` +
    `MENSAJE: ${params.mensajeLead.slice(0, 600)}`;

  let raw = "";
  try {
    const resp = await callClaudeIA(
      "DETERMINAR_TAGS_GHL",
      { max_tokens: 200, system: SYSTEM, messages: [{ role: "user", content: userContent }] },
      { traceId: randomUUID(), leadId: params.contactId }
    );
    raw = (resp.content[0] as { text: string }).text.trim();
  } catch {
    return FALLBACK;
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return FALLBACK;

  try {
    const p = JSON.parse(match[0]) as {
      tagsAgregar?: unknown;
      tagsRemover?: unknown;
      stageKey?: unknown;
      razon?: unknown;
    };
    return {
      tagsAgregar: Array.isArray(p.tagsAgregar) ? (p.tagsAgregar as string[]) : [],
      tagsRemover: Array.isArray(p.tagsRemover) ? (p.tagsRemover as string[]) : [],
      stageKey:    typeof p.stageKey === "string" ? p.stageKey : null,
      razon:       typeof p.razon === "string" ? p.razon : "Sin razón",
    };
  } catch {
    return FALLBACK;
  }
}
