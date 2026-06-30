import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

// S11.2 — Califica la calidad de una conversación cerrada (ganada o perdida)
export async function calcularCalidadConversacion(
  leadId: string,
  ganada: boolean
): Promise<void> {
  const supabase = createServiceClient();

  const [{ data: lead }, { data: mensajes }] = await Promise.all([
    supabase.from("leads").select("vendedor_id, nombre").eq("id", leadId).single(),
    supabase.from("mensajes")
      .select("direccion, contenido, created_at")
      .eq("lead_id", leadId)
      .order("created_at")
      .limit(30),
  ]);

  if (!mensajes?.length) return;

  const dialogo = mensajes.map((m) =>
    `[${m.direccion === "entrante" ? "LEAD" : "ECMATIC"}] ${m.contenido}`
  ).join("\n");

  const prompt = `Eres evaluador de calidad de ventas de certificaciones CONOCER. Evalúa esta conversación.

Conversación (${ganada ? "GANADA" : "PERDIDA"}):
${dialogo.slice(0, 4000)}

Califica cada dimensión de 0 a 25:
- coherencia: ¿las respuestas siguen el hilo lógico de la conversación?
- velocidad: ¿las respuestas fueron oportunas? (considera los tiempos)
- cobertura_objeciones: ¿se atendieron las objeciones del lead?
- personalizacion: ¿se usó el nombre, temperamento y contexto del lead?

Responde en JSON:
{
  "coherencia": 0-25,
  "velocidad": 0-25,
  "cobertura_objeciones": 0-25,
  "personalizacion": 0-25,
  "analisis": "2 oraciones sobre fortalezas y áreas de mejora"
}`;

  try {
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const data = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      coherencia?: number; velocidad?: number;
      cobertura_objeciones?: number; personalizacion?: number; analisis?: string;
    };

    const coherencia = Math.min(25, Math.max(0, data.coherencia ?? 15));
    const velocidad = Math.min(25, Math.max(0, data.velocidad ?? 15));
    const cobertura = Math.min(25, Math.max(0, data.cobertura_objeciones ?? 15));
    const personal = Math.min(25, Math.max(0, data.personalizacion ?? 15));

    await supabase.from("calidad_conversacional").insert({
      lead_id: leadId,
      vendedor_id: lead?.vendedor_id ?? null,
      score_total: coherencia + velocidad + cobertura + personal,
      coherencia, velocidad,
      cobertura_objeciones: cobertura,
      personalizacion: personal,
      ganada,
      analisis_ia: data.analisis ?? null,
    });
  } catch (err) {
    console.error("[calidad] Error calculando:", err);
  }
}

// S62 — Lee las últimas 3 evaluaciones del lead; si ≥2 tienen una dimensión baja,
// devuelve un hint para inyectar en el system prompt del motor de respuesta.
export async function obtenerHintCalidadLead(leadId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("calidad_conversacional")
    .select("coherencia, cobertura_objeciones, personalizacion")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (!data || data.length < 2) return null;
  const umbral = 12, minDebil = 2;
  type Fila = { coherencia: number; cobertura_objeciones: number; personalizacion: number };
  const debil = (col: keyof Fila) =>
    (data as Fila[]).filter((r) => r[col] < umbral).length >= minDebil;
  const hints: string[] = [];
  if (debil("cobertura_objeciones")) hints.push("priorizar el manejo de objeciones del lead");
  if (debil("personalizacion"))      hints.push("usar el nombre y contexto personal del lead en la respuesta");
  if (debil("coherencia"))           hints.push("mantener el hilo de la conversación, no cambiar de tema abruptamente");
  return hints.length > 0
    ? `Área(s) débil(es) en conversaciones anteriores con este lead: ${hints.join("; ")}.`
    : null;
}

// S11.3 — Detecta la objeción dominante que pierde más leads para un vendedor
export async function objecionDominanteVendedor(vendedorId: string): Promise<{
  objecion: string; frecuencia: number; impacto: string;
} | null> {
  const supabase = createServiceClient();

  const { data: leads } = await supabase
    .from("leads").select("id").eq("vendedor_id", vendedorId)
    .eq("pipeline_stage", "Perdido");

  if (!leads?.length) return null;

  const { data: mensajes } = await supabase
    .from("mensajes")
    .select("intencion_clasificada")
    .in("lead_id", leads.map((l) => l.id))
    .not("intencion_clasificada", "is", null);

  const conteo: Record<string, number> = {};
  for (const m of mensajes ?? []) {
    if (m.intencion_clasificada?.startsWith("objecion")) {
      conteo[m.intencion_clasificada] = (conteo[m.intencion_clasificada] ?? 0) + 1;
    }
  }

  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return null;

  const [objecion, frecuencia] = entradas[0];
  const impacto = frecuencia >= 5 ? "alto" : frecuencia >= 2 ? "medio" : "bajo";
  return { objecion: objecion.replace("objecion_", ""), frecuencia, impacto };
}

export async function promedioCalidadVendedor(vendedorId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("calidad_conversacional")
    .select("score_total")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data?.length) return 0;
  return Math.round(data.reduce((s, r) => s + r.score_total, 0) / data.length);
}
