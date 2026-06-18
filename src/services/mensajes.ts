import { createServiceClient } from "@/lib/supabase/service";
import type { IncomingMessage } from "@/lib/whatsapp/client";
import type { IntencionClasificada } from "@/lib/supabase/types";
import { procesarConversacion } from "@/services/conversacion";

const BUFFER_WINDOW_MS = 8_000;

// ── Punto de entrada desde el webhook ────────────────────────────────────
export async function procesarMensajeEntrante(msg: IncomingMessage) {
  const supabase = createServiceClient();

  // Deduplicar por wa_message_id
  const { data: existente } = await supabase
    .from("mensajes_buffer")
    .select("id")
    .eq("wa_message_id", msg.messageId)
    .maybeSingle();

  if (existente) return;

  // Guardar en buffer
  await supabase.from("mensajes_buffer").insert({
    telefono: msg.from,
    contenido: msg.body,
    wa_message_id: msg.messageId,
  });

  // Esperar la ventana de agrupamiento
  await delay(BUFFER_WINDOW_MS);

  // Después de la espera, drenar y procesar
  await procesarBuffer(msg.from);
}

// ── Drena el buffer y dispara la conversación ─────────────────────────────
async function procesarBuffer(telefono: string) {
  const supabase = createServiceClient();

  const { data: buffered } = await supabase
    .from("mensajes_buffer")
    .select("*")
    .eq("telefono", telefono)
    .order("created_at", { ascending: true });

  if (!buffered || buffered.length === 0) return;

  // Verificar que no llegó otro mensaje hace menos de 8s (evitar procesar antes de tiempo)
  const ultimoMs = new Date(buffered[buffered.length - 1].created_at).getTime();
  if (Date.now() - ultimoMs < BUFFER_WINDOW_MS - 1_000) return;

  // Eliminar del buffer (idempotencia)
  const ids = buffered.map((m) => m.id);
  await supabase.from("mensajes_buffer").delete().in("id", ids);

  await procesarConversacion(
    telefono,
    buffered.map((m) => m.contenido),
    buffered[0].wa_message_id ?? undefined
  );
}

// ── Persiste mensajes ya procesados ──────────────────────────────────────
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

// ── Obtiene historial reciente del lead ───────────────────────────────────
export async function obtenerHistorial(leadId: string, limite = 10): Promise<string> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("mensajes")
    .select("direccion, contenido")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (!data || data.length === 0) return "";

  return data
    .reverse()
    .map((m) => `${m.direccion === "entrante" ? "Lead" : "ECMatic"}: ${m.contenido}`)
    .join("\n");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
