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

export async function obtenerMensajes(conversationId: string, limit = 20): Promise<GHLMessage[]> {
  const data = await ghlGet<{ messages: { messages: GHLMessage[] } }>(
    `/conversations/${conversationId}/messages`,
    { limit: String(limit) }
  );
  return data.messages?.messages ?? [];
}

export async function inscribirEnWorkflow(contactId: string, workflowId: string): Promise<void> {
  await ghlPost(`/contacts/${contactId}/workflow/${workflowId}`, {
    eventStartTime: new Date().toISOString(),
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

// Sprint 38 — Elimina una conversación completa en GHL (reset usuario prueba)
export async function eliminarConversacion(conversationId: string): Promise<void> {
  try {
    await ghlDelete(`/conversations/${conversationId}`);
  } catch {
    // Si la API no soporta DELETE en este endpoint, el error es silencioso
  }
}

// Crea una nota interna en la conversación — trigger de push en LeadConnector
// GHL requiere contactId además de conversationId para este endpoint
export async function crearNotaInternaGHL(conversationId: string, texto: string, contactId?: string): Promise<void> {
  await ghlPost("/conversations/messages", {
    type: "Note",
    conversationId,
    ...(contactId ? { contactId } : {}),
    message: texto,
  });
}
