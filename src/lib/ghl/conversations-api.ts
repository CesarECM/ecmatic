import { ghlGet, ghlPost, ghlDelete } from "./client";

export interface GHLMessage {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  body?: string;
  text?: string;
  dateAdded: string;
  status?: string;
}

export interface GHLConversation {
  id: string;
  contactId: string;
  locationId: string;
  type?: string;
  lastMessageDate?: string;
}

export async function buscarConversacionWA(contactId: string): Promise<GHLConversation | null> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const data = await ghlGet<{ conversations: GHLConversation[]; total: number }>(
    "/conversations/search",
    { locationId, contactId, type: "TYPE_WHATSAPP" }
  );
  return data.conversations?.[0] ?? null;
}

export async function obtenerOCrearConversacionWA(contactId: string): Promise<string | null> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const existente = await buscarConversacionWA(contactId);
  if (existente) return existente.id;
  const data = await ghlPost<{ conversation: GHLConversation }>("/conversations/", {
    contactId,
    locationId,
  });
  return data.conversation?.id ?? null;
}

export async function obtenerMensajes(conversationId: string, limit = 20): Promise<GHLMessage[]> {
  const data = await ghlGet<{ messages: { messages: GHLMessage[] } }>(
    `/conversations/${conversationId}/messages`,
    { limit: String(limit) }
  );
  return data.messages?.messages ?? [];
}

export async function inscribirEnWorkflow(contactId: string, workflowId: string): Promise<void> {
  const t = new Date(Date.now() + 360_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const eventStartTime =
    `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}` +
    `T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+00:00`;
  await ghlPost(`/contacts/${contactId}/workflow/${workflowId}`, {
    eventStartTime,
  });
}

export async function enviarMensajeGHL(conversationId: string, mensaje: string, contactId?: string): Promise<void> {
  await ghlPost("/conversations/messages", {
    type: "WhatsApp",
    conversationId,
    contactId,
    message: mensaje,
  });
}

// ── Envío fragmentado para respuestas largas ──────────────────────────────
// Divide el texto en fragmentos que se envían por separado con un delay de
// 1 segundo entre ellos, simulando la escritura humana en WhatsApp.
// La interfaz ECMatic sigue guardando el texto completo como un solo mensaje.

const MAX_FRAGMENT_LEN    = 500; // chars: párrafo máximo antes de cortar por oración
const MIN_TOTAL_PARA_SPLIT = 200; // no fragmentar si el texto es corto
const DELAY_ENTRE_FRAGMENTOS = 1_000; // ms

function fragmentarPorOraciones(texto: string, maxLen: number): string[] {
  const partes = texto.split(/(?<=[.!?])\s+/);
  const fragmentos: string[] = [];
  let acumulado = "";

  for (const parte of partes) {
    const candidato = acumulado ? `${acumulado} ${parte}` : parte;
    if (candidato.length <= maxLen || !acumulado) {
      acumulado = candidato;
    } else {
      fragmentos.push(acumulado.trim());
      acumulado = parte;
    }
  }
  if (acumulado.trim()) fragmentos.push(acumulado.trim());
  return fragmentos.length ? fragmentos : [texto];
}

export function fragmentarMensajeGHL(texto: string): string[] {
  if (texto.length <= MIN_TOTAL_PARA_SPLIT) return [texto];

  const parrafos = texto.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  if (parrafos.length <= 1) {
    return fragmentarPorOraciones(texto, MAX_FRAGMENT_LEN);
  }

  return parrafos.flatMap((p) =>
    p.length > MAX_FRAGMENT_LEN ? fragmentarPorOraciones(p, MAX_FRAGMENT_LEN) : [p],
  );
}

export async function enviarMensajeGHLFragmentado(
  conversationId: string,
  mensaje:        string,
  contactId?:     string,
): Promise<void> {
  const fragmentos = fragmentarMensajeGHL(mensaje);
  for (let i = 0; i < fragmentos.length; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, DELAY_ENTRE_FRAGMENTOS));
    await enviarMensajeGHL(conversationId, fragmentos[i], contactId);
  }
}

// Sprint 38 — Elimina una conversación completa en GHL (reset usuario prueba)
export async function eliminarConversacion(conversationId: string): Promise<void> {
  try {
    await ghlDelete(`/conversations/${conversationId}`);
  } catch {
    // Si la API no soporta DELETE en este endpoint, el error es silencioso
  }
}

// Crea una nota en el contacto GHL — endpoint correcto para notas internas
// /conversations/messages no acepta type "Note"; usar /contacts/{id}/notes
export async function crearNotaInternaGHL(contactId: string, texto: string): Promise<void> {
  await ghlPost(`/contacts/${contactId}/notes`, { body: texto });
}
