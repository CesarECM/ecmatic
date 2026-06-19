import { createServiceClient } from "@/lib/supabase/service";
import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";

// S5.8 — Detecta menciones de competidores en el texto de una conversación.
// Registra en la tabla competidores e inyecta en metadata del lead.
export async function detectarCompetidores(
  texto: string,
  leadId: string
): Promise<void> {
  const prompt = `Analiza este mensaje de un lead de certificaciones CONOCER en México.
Identifica si se menciona algún competidor (otro centro de evaluación, capacitadora, CENEVAL, ICAP, etc.).
Responde en JSON: {"competidores": ["nombre1", "nombre2"]} o {"competidores": []} si no hay.

Mensaje: "${texto}"`;

  let nombresDetectados: string[] = [];
  try {
    const res = await anthropic.messages.create({
      model: modeloPorTarea("COMPETIDORES"),
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { competidores?: string[] };
    nombresDetectados = json.competidores ?? [];
  } catch {
    return;
  }

  if (nombresDetectados.length === 0) return;

  const supabase = createServiceClient();
  const ahora = new Date().toISOString();

  for (const nombre of nombresDetectados) {
    const { data: existente } = await supabase
      .from("competidores")
      .select("id, menciones")
      .eq("nombre", nombre.toLowerCase())
      .maybeSingle();

    if (existente) {
      await supabase
        .from("competidores")
        .update({ menciones: existente.menciones + 1, ultima_mencion: ahora })
        .eq("id", existente.id);
    } else {
      await supabase
        .from("competidores")
        .insert({ nombre: nombre.toLowerCase(), menciones: 1, ultima_mencion: ahora });
    }
  }

  // Registra en metadata del lead para activar rama de diferenciación
  const { data: lead } = await supabase
    .from("leads")
    .select("metadata")
    .eq("id", leadId)
    .single();

  if (lead) {
    const meta = lead.metadata as Record<string, unknown>;
    const previos = (meta.competidores_mencionados as string[] | undefined) ?? [];
    const unicos = [...new Set([...previos, ...nombresDetectados.map((n) => n.toLowerCase())])];
    await supabase
      .from("leads")
      .update({ metadata: { ...meta, competidores_mencionados: unicos } })
      .eq("id", leadId);
  }
}

export async function listarCompetidores() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("competidores")
    .select("*")
    .order("menciones", { ascending: false });
  if (error) throw new Error(`[competidores] Error: ${error.message}`);
  return data ?? [];
}
