import { createServiceClient } from "@/lib/supabase/service";

// Retorna el historial del lead como array de mensajes Claude-compatibles.
// Garantiza alternancia estricta user/assistant requerida por la API de Anthropic:
// mergea consecutivos del mismo rol y descarta cualquier leading assistant.
export async function obtenerHistorialMultiTurn(
  leadId: string,
  limite: number,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const { data } = await createServiceClient()
      .from("mensajes")
      .select("direccion, contenido")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(limite);

    if (!data?.length) return [];

    const mensajes = (data as { direccion: string; contenido: string }[])
      .reverse()
      .map((m) => ({
        role:    (m.direccion === "entrante" ? "user" : "assistant") as "user" | "assistant",
        content: m.contenido,
      }));

    // Mergear consecutivos del mismo rol
    const merged: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of mensajes) {
      const prev = merged[merged.length - 1];
      if (prev?.role === msg.role) {
        prev.content += "\n" + msg.content;
      } else {
        merged.push({ role: msg.role, content: msg.content });
      }
    }

    // La API de Anthropic requiere que el primer mensaje sea "user"
    while (merged.length > 0 && merged[0].role !== "user") {
      merged.shift();
    }

    return merged;
  } catch {
    return [];
  }
}
