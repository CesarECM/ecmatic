import { createServiceClient } from "@/lib/supabase/service";
import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import type { TemperaturaCierre } from "@/lib/supabase/types";

// S7.7 — Guarda un transcripto y dispara el procesamiento por IA
export async function guardarTranscripto(params: {
  leadId: string;
  citaId?: string;
  contenido: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("transcriptos_meet")
    .insert({ lead_id: params.leadId, cita_id: params.citaId ?? null, contenido: params.contenido })
    .select("id")
    .single();

  if (error || !data) throw new Error(`[transcriptos] ${error?.message}`);
  void procesarConIA(data.id, params.contenido);
  return data.id;
}

// S7.7 — Analiza el transcripto con IA: objeciones, compromisos y temperatura
async function procesarConIA(transcriptoId: string, contenido: string): Promise<void> {
  const prompt = `Analiza esta transcripción de una sesión de ventas de certificaciones CONOCER.
Extrae: objeciones planteadas, compromisos adquiridos y temperatura de cierre al final.

Transcripción:
"""
${contenido.slice(0, 4000)}
"""

Responde en JSON:
{
  "objeciones": ["objecion1", "objecion2"],
  "compromisos": ["compromiso1", "compromiso2"],
  "temperatura_cierre": "fria|tibia|caliente",
  "resumen": "2-3 oraciones sobre el resultado de la sesión"
}`;

  try {
    const res = await anthropic.messages.create({
      model: modeloPorTarea("ANALISIS"), max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      objeciones?: string[];
      compromisos?: string[];
      temperatura_cierre?: TemperaturaCierre;
      resumen?: string;
    };

    const supabase = createServiceClient();
    await supabase.from("transcriptos_meet").update({
      objeciones_detectadas: json.objeciones ?? [],
      compromisos_detectados: json.compromisos ?? [],
      temperatura_cierre: json.temperatura_cierre ?? null,
      analisis_completo: json,
      procesado_por_ia: true,
    }).eq("id", transcriptoId);

    // Registrar compromisos detectados como promesas si los hay
    if (json.compromisos?.length) {
      const { data: trans } = await supabase
        .from("transcriptos_meet").select("lead_id, cita_id").eq("id", transcriptoId).single();
      if (trans) {
        for (const c of json.compromisos) {
          await supabase.from("promesas_conversacion").insert({
            lead_id: trans.lead_id, actor: "vendedor", promesa: c,
          });
        }
      }
    }
  } catch (err) {
    console.error("[transcriptos] Error IA:", err);
  }
}

export async function listarTranscriptos(leadId?: string) {
  const supabase = createServiceClient();
  let q = supabase.from("transcriptos_meet")
    .select("id, lead_id, cita_id, temperatura_cierre, procesado_por_ia, created_at, leads(nombre)")
    .order("created_at", { ascending: false });
  if (leadId) q = q.eq("lead_id", leadId);
  const { data, error } = await q;
  if (error) throw new Error(`[transcriptos] ${error.message}`);
  return data ?? [];
}
