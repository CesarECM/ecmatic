import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { crearRecurso } from "./conocimiento";

// S9.5 — Genera preguntas de encuesta personalizadas con IA
export async function generarEncuesta(leadId: string): Promise<string | null> {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, avatar_id")
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  const prompt = `Eres experto en certificaciones CONOCER. Genera 3 preguntas de encuesta personalizadas para este candidato.
Objetivo: llenar huecos de información sobre sus necesidades reales, objeciones o experiencia.

Perfil:
- Temperamento DISC: ${lead.temperamento_inferido ?? "desconocido"}
- Etapa: ${lead.pipeline_stage}
- Ruta: ${lead.pipeline_ruta}

Genera preguntas cortas, conversacionales, aptas para WhatsApp.
Responde en JSON: ["pregunta 1", "pregunta 2", "pregunta 3"]`;

  const res = await callClaudeIA("ENCUESTA", {
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = (res.content[0] as { text: string }).text.trim();
  const preguntas = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as string[];
  if (!preguntas.length) return null;

  const { data: encuesta } = await supabase
    .from("encuestas")
    .insert({ lead_id: leadId, preguntas, estado: "pendiente" })
    .select("id").single();

  return encuesta?.id ?? null;
}

// S9.5 — Envía la encuesta al lead por WhatsApp
export async function enviarEncuesta(leadId: string, encuestaId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const [{ data: lead }, { data: encuesta }] = await Promise.all([
    supabase.from("leads").select("nombre, telefono").eq("id", leadId).single(),
    supabase.from("encuestas").select("preguntas").eq("id", encuestaId).single(),
  ]);

  if (!lead?.telefono || !encuesta?.preguntas) return false;

  const preguntas = encuesta.preguntas as string[];
  const texto = `Hola${lead.nombre ? ` ${lead.nombre}` : ""} 😊 Nos gustaría conocer mejor tu experiencia. ¿Puedes responder estas breves preguntas?\n\n${preguntas.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;

  try {
    await sendTextMessage(lead.telefono, texto);
    await supabase.from("encuestas").update({ estado: "enviada" }).eq("id", encuestaId);
    return true;
  } catch {
    return false;
  }
}

// S9.6 — Procesa respuestas con IA: sugiere recursos KB o actualiza avatares
export async function procesarRespuestasEncuesta(
  encuestaId: string,
  respuestas: Record<string, string>
): Promise<void> {
  const supabase = createServiceClient();
  const { data: enc } = await supabase
    .from("encuestas").select("lead_id, preguntas").eq("id", encuestaId).single();
  if (!enc) return;

  await supabase.from("encuestas")
    .update({ respuestas, estado: "respondida" }).eq("id", encuestaId);

  const prompt = `Analiza estas respuestas de encuesta de un candidato a certificación CONOCER.
¿Revelan objeciones no registradas, nuevas necesidades o información valiosa para el CRM?

Preguntas: ${JSON.stringify(enc.preguntas)}
Respuestas: ${JSON.stringify(respuestas)}

Responde en JSON:
{
  "sugerencia_kb": "null o descripción de recurso nuevo",
  "objecion_detectada": "null o tipo de objeción",
  "info_util": "null o información relevante para el perfil del lead"
}`;

  try {
    const res = await callClaudeIA("ENCUESTA", {
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const analisis = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      sugerencia_kb?: string; objecion_detectada?: string; info_util?: string;
    };

    if (analisis.sugerencia_kb && analisis.sugerencia_kb !== "null") {
      await crearRecurso("faq", "Sugerencia desde encuesta", analisis.sugerencia_kb, "ia_sugerido");
    }

    await supabase.from("encuestas").update({ procesada_ia: true }).eq("id", encuestaId);
  } catch { /* no bloquear */ }
}
