import { createServiceClient } from "@/lib/supabase/service";
import type { IncomingMessage } from "@/lib/whatsapp/client";
import type { IntencionClasificada } from "@/lib/supabase/types";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { procesarConversacion } from "@/services/conversacion";

const BUFFER_WINDOW_MS = 8_000;

// ── S1.2: Encola el mensaje en el buffer de Supabase ───────────────────────
export async function encolarMensaje(msg: IncomingMessage) {
  const supabase = createServiceClient();

  // Deduplicar por wa_message_id
  const { data: existente } = await supabase
    .from("mensajes_buffer")
    .select("id")
    .eq("wa_message_id", msg.messageId)
    .maybeSingle();

  if (existente) return;

  await supabase.from("mensajes_buffer").insert({
    telefono: msg.from,
    contenido: msg.body,
    wa_message_id: msg.messageId,
  });

  // Espera la ventana y procesa si no llegaron más mensajes
  setTimeout(() => procesarBuffer(msg.from), BUFFER_WINDOW_MS);
}

// ── S1.2: Drena el buffer y dispara el procesamiento ──────────────────────
async function procesarBuffer(telefono: string) {
  const supabase = createServiceClient();

  // Toma todos los mensajes del buffer para este número
  const { data: buffered } = await supabase
    .from("mensajes_buffer")
    .select("*")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  if (!buffered || buffered.length === 0) return;

  // Verifica que el último mensaje tiene más de 8s (evita carreras)
  const ultimo = new Date(buffered[buffered.length - 1].created_at).getTime();
  if (Date.now() - ultimo < BUFFER_WINDOW_MS - 500) return;

  // Elimina del buffer antes de procesar (idempotencia)
  const ids = buffered.map((m) => m.id);
  await supabase.from("mensajes_buffer").delete().in("id", ids);

  const textos = buffered.map((m) => m.contenido);
  await procesarConversacion(telefono, textos, buffered[0].wa_message_id ?? undefined);
}

// ── Obtiene historial reciente del lead para contexto IA ──────────────────
export async function obtenerHistorial(leadId: string, limite = 10): Promise<string> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("mensajes")
    .select("direccion, contenido, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (!data || data.length === 0) return "";

  return data
    .reverse()
    .map((m) => `${m.direccion === "entrante" ? "Lead" : "ECMatic"}: ${m.contenido}`)
    .join("\n");
}

// ── Guarda mensajes procesados en la tabla mensajes ──────────────────────
export async function guardarMensaje(params: {
  leadId: string;
  contenido: string;
  direccion: "entrante" | "saliente";
  intencion?: IntencionClasificada | null;
  waMessageId?: string;
}) {
  const supabase = createServiceClient();

  await supabase.from("mensajes").insert({
    lead_id: params.leadId,
    canal: "whatsapp",
    direccion: params.direccion,
    contenido: params.contenido,
    intencion_clasificada: params.intencion ?? null,
    procesado_por_ia: true,
    wa_message_id: params.waMessageId ?? null,
  });
}

