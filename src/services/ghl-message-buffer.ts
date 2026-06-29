import { createServiceClient } from "@/lib/supabase/service";
import { buscarConversacionWA, obtenerMensajes } from "@/lib/ghl/conversations-api";
import { logSistema } from "@/services/log-sistema";

const BUFFER_WINDOW_MS = 15_000;
const CAMPANA_ACTIVA   = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

// ── Resuelve el cuerpo del mensaje desde payload o vía GHL API ───────────
export async function resolverCuerpoGHL(
  payload:         Record<string, unknown>,
  contactId:       string,
  conversationId?: string,
): Promise<string> {
  let cuerpo = ((payload.body ?? payload.message ?? payload.text ?? "") as string).trim();

  if (!cuerpo) {
    try {
      const convId = conversationId ||
        (await buscarConversacionWA(contactId).catch(() => null))?.id;
      if (convId) {
        const mensajes = await obtenerMensajes(convId, 5);
        const ultimo   = mensajes.find((m) => m.direction === "inbound");
        cuerpo = ((ultimo?.body ?? ultimo?.text) ?? "").trim();
      }
    } catch { /* cuerpo queda vacío */ }
  }

  return cuerpo;
}

// ── Encola un mensaje en el buffer activo del contacto ───────────────────
export async function encolarEnBuffer(params: {
  contactId:       string;
  conversationId?: string;
  cuerpo:          string;
  campana?:        string;
}): Promise<void> {
  const { contactId, conversationId, cuerpo, campana = CAMPANA_ACTIVA } = params;

  if (!cuerpo) return;

  const supabase     = createServiceClient();
  const nuevoMensaje = { cuerpo, received_at: new Date().toISOString() };

  const { error } = await supabase.rpc("ghl_buffer_upsert", {
    p_contact_id:      contactId,
    p_conversation_id: conversationId ?? null,
    p_campana:         campana,
    p_mensaje:         nuevoMensaje,
  });

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "ghl_buffer.encolar",
    fase:       error ? "error" : "ok",
    resultado:  error
      ? (error as { message: string }).message
      : cuerpo.slice(0, 60),
    metadata:   { contactId, conversationId: conversationId ?? null, campana },
  });
}

// ── Retorna buffers listos (>15 s sin actividad) y los marca procesados ──
export async function obtenerYMarcarPendientes(): Promise<
  Array<{
    contactId:      string;
    conversationId: string | null;
    cuerpos:        string[];
    campana:        string;
  }>
> {
  const supabase = createServiceClient();
  const cutoff   = new Date(Date.now() - BUFFER_WINDOW_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("ghl_message_buffer")
    .select("id, contact_id, conversation_id, mensajes_json, campana")
    .eq("procesado", false)
    .lt("ultimo_mensaje_at", cutoff);

  if (error || !data?.length) return [];

  // Marcar ANTES de procesar — evita doble proceso si el cron se solapa
  const ids = (data as Array<{ id: string }>).map((r) => r.id);
  await db
    .from("ghl_message_buffer")
    .update({ procesado: true, procesado_at: new Date().toISOString() })
    .in("id", ids);

  return (data as Array<{
    contact_id:      string;
    conversation_id: string | null;
    mensajes_json:   Array<{ cuerpo: string }>;
    campana:         string;
  }>).map((r) => ({
    contactId:      r.contact_id,
    conversationId: r.conversation_id,
    cuerpos:        r.mensajes_json.map((m) => m.cuerpo),
    campana:        r.campana,
  }));
}
