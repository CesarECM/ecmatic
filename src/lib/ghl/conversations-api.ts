import { ghlGet, ghlPost } from "./client";

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

export async function enviarMensajeGHL(conversationId: string, mensaje: string): Promise<void> {
  await ghlPost("/conversations/messages", {
    type: "WhatsApp",
    conversationId,
    message: mensaje,
  });
}
