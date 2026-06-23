import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import type { ActorPromesa } from "@/lib/supabase/types";

// S5.10 — Detecta compromisos en el texto y los guarda para seguimiento.
export async function detectarPromesas(
  texto: string,
  leadId: string,
  mensajeId: string
): Promise<void> {
  const prompt = `Analiza este mensaje de una conversación de ventas de certificaciones CONOCER.
Detecta promesas o compromisos explícitos ("te llamo mañana", "te mando el link hoy", "me confirmas esta semana").

Hoy es: ${new Date().toISOString().split("T")[0]}

Mensaje: "${texto}"

Responde en JSON: {"promesas": [{"actor": "vendedor|lead|ia", "promesa": "...", "fecha_prometida": "YYYY-MM-DDTHH:mm:ssZ o null"}]}
o {"promesas": []} si no hay compromisos claros.`;

  let promesas: { actor: string; promesa: string; fecha_prometida: string | null }[] = [];
  try {
    const res = await callClaudeIA("CLASIFICAR", {
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      promesas?: typeof promesas;
    };
    promesas = json.promesas ?? [];
  } catch {
    return;
  }

  if (promesas.length === 0) return;

  const supabase = createServiceClient();
  for (const p of promesas) {
    await supabase.from("promesas_conversacion").insert({
      lead_id: leadId,
      mensaje_id: mensajeId,
      actor: (p.actor as ActorPromesa) || "ia",
      promesa: p.promesa,
      fecha_prometida: p.fecha_prometida,
    });
  }
}

// S5.10 — Verifica promesas vencidas y marca alerta. Llamar desde cron o diariamente.
export async function verificarPromesasVencidas(): Promise<number> {
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();

  const { data: vencidas } = await supabase
    .from("promesas_conversacion")
    .select("id, lead_id, actor, promesa, leads(nombre, telefono, vendedor_id)")
    .is("cumplida", null)
    .eq("alerta_enviada", false)
    .lt("fecha_prometida", ahora)
    .not("fecha_prometida", "is", null);

  if (!vencidas || vencidas.length === 0) return 0;

  const ids = vencidas.map((p) => p.id);
  await supabase
    .from("promesas_conversacion")
    .update({ alerta_enviada: true })
    .in("id", ids);

  console.warn(`[promesas] ${vencidas.length} promesas vencidas marcadas para alerta`);
  return vencidas.length;
}

export async function listarPromesas(leadId?: string) {
  const supabase = createServiceClient();
  let query = supabase
    .from("promesas_conversacion")
    .select("*, leads(nombre, telefono)")
    .order("fecha_prometida", { ascending: true });

  if (leadId) query = query.eq("lead_id", leadId);

  const { data, error } = await query;
  if (error) throw new Error(`[promesas] Error: ${error.message}`);
  return data ?? [];
}

export async function marcarPromesaCumplida(id: string, cumplida: boolean): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("promesas_conversacion")
    .update({ cumplida })
    .eq("id", id);
  if (error) throw new Error(`[promesas] Error actualizando: ${error.message}`);
}
