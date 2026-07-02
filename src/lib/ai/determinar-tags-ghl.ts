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

## Taxonomía de tags (SOLO estos 7 namespaces, separador SIEMPRE guion "-")

### svc — Servicio de interés (additive)
svc-smec   → SmartBuilder EC (EC0217.01)
svc-ecb1   → Certificación EC-B1
svc-taller → Taller presencial

### int — Intención / temperatura (MUTUAMENTE EXCLUSIVO — borrar el anterior antes de agregar)
int-caliente → Listo para comprar, pide precio o forma de pago
int-tibio    → Interesado pero sin urgencia
int-frio     → Sin respuesta activa o respuesta mínima
int-perdido  → Descartó explícitamente

### obj — Objeción detectada (additive)
obj-precio     → "Es muy caro" / pregunta agresiva por descuento
obj-tiempo     → "No tengo tiempo ahora"
obj-utilidad   → "No sé si me sirve" / duda de relevancia
obj-confianza  → Duda de la institución o del proceso
obj-empresa    → Necesita aprobación de jefe o empresa

### per — Perfil del lead (set once — NO cambiar si ya existe)
per-disc-d → Temperamento Dominante (directo, orientado a resultados)
per-disc-i → Influyente (entusiasta, social)
per-disc-s → Estable (tranquilo, leal)
per-disc-c → Concienzudo (analítico, detallista)
per-b2c    → Persona física
per-pyme   → Empresa pequeña
per-corp   → Corporativo / institución

### evt — Evento con fecha (additive, NUNCA borrar)
evt-contacto-YYYYMM → Primer contacto
evt-cotizado-YYYYMM → Se le cotizó
evt-demo-YYYYMM     → Tuvo demo
evt-pago-YYYYMM     → Realizó pago

### flg — Flags de comportamiento (additive)
flg-cliente      → Ya compró al menos una vez
flg-vip          → Trato prioritario
flg-no-contactar → Blacklist
flg-wa-biz       → Tiene WhatsApp Business (auto-replies)

### ofr — Oferta habilitada por el admin (additive — NUNCA agregar automáticamente)
ofr-{producto}   → El admin decidió ofrecer este producto (NO tocar estos tags)

## Reglas de decisión

- Tags int-* son mutuamente exclusivos: SIEMPRE incluir en tagsRemover los otros int- cuando agregues uno
- Tags per-* son set once: si ya existen en los actuales, NO los toques
- Tags ofr-* son solo del admin: NUNCA agregarlos ni removerlos
- Tags evt-* nunca se borran
- Si un tag ya está en los actuales, NO lo incluyas en tagsAgregar

## Cuándo aplicar cada int-

- Primera respuesta positiva al mensaje → int-tibio (si no tiene ya uno superior)
- Pregunta por precio, costo, formas de pago → int-caliente
- Pide más información, hace preguntas → int-tibio
- Quiere agendar demo o reunión → int-tibio o int-caliente según tono
- Sin respuesta o respuesta muy corta → int-frio
- Rechaza explícitamente → int-perdido

## Cuándo aplicar svc-

- Menciona SmartBuilder, EC0217.01, certificación CONOCER → svc-smec
- Pregunta por taller presencial → svc-taller

## Etapas válidas de pipeline (stageKey)

prospecto_nuevo | contactado | calificado | interesado_sbc | demo_agendada |
propuesta_enviada | negociacion | ganado_sbc | ganado_manual | en_certificacion |
certificado | reactivar | null

Solo mover a etapas superiores. Si la etapa actual ya es superior o no hay señal clara → stageKey: null.

Responde SOLO en JSON sin markdown ni explicación:
{"tagsAgregar":["int-caliente","svc-smec"],"tagsRemover":["int-tibio","int-frio"],"stageKey":"interesado_sbc","razon":"Pregunta directa por precio indica intención caliente en SmartBuilder"}`;

const FALLBACK: DecisionTagsGHL = {
  tagsAgregar: ["int-tibio"],
  tagsRemover: ["int-frio"],
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
    `INTENCIÓN CLASIFICADA: ${params.intencion}\n` +
    `MENSAJE DEL LEAD: ${params.mensajeLead.slice(0, 600)}`;

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

    // Filtro de seguridad: nunca tocar tags ofr- automáticamente
    const filtrar = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? (arr as string[]).filter(t => typeof t === "string" && !t.startsWith("ofr-"))
        : [];

    return {
      tagsAgregar: filtrar(p.tagsAgregar),
      tagsRemover: filtrar(p.tagsRemover),
      stageKey:    typeof p.stageKey === "string" ? p.stageKey : null,
      razon:       typeof p.razon === "string" ? p.razon : "Sin razón",
    };
  } catch {
    return FALLBACK;
  }
}
