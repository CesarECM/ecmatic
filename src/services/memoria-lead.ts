// MPS-16 S63 — Genera y guarda un resumen comprimido de la conversación del lead.
// Trigger: moverLead() cuando Comprado o Perdido.
// Se inyecta en el system prompt la próxima vez que el lead reabra conversación.

import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { logSistema } from "@/services/log-sistema";

export async function generarMemoriaLead(leadId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: mensajes } = await supabase
    .from("mensajes")
    .select("direccion, contenido")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!mensajes?.length) return;

  const dialogo = [...mensajes]
    .reverse()
    .map((m) => `[${m.direccion === "entrante" ? "LEAD" : "IA"}] ${m.contenido}`)
    .join("\n");

  const res = await callClaudeIA("MEMORIA_LEAD", {
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Eres asistente de CRM. Resume en 3-5 frases concisas esta conversación:
1. Qué técnicas IA funcionaron bien con este lead
2. Sus principales resistencias u objeciones
3. Su tono preferido y estilo de comunicación
4. Estado en que cerró la conversación

Conversación:
${dialogo.slice(0, 4000)}

Responde en texto plano, sin JSON, sin bullet points, en español.`,
    }],
  });

  const memoria = (res.content[0] as { text: string }).text.trim();
  if (!memoria) return;

  await supabase.from("leads").update({ memoria_ia: memoria }).eq("id", leadId);

  void logSistema({
    categoria: "ia", tipoAccion: "memoria_lead.generar", fase: "ok",
    leadId, resultado: `${memoria.length} chars`,
  });
}
