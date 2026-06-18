const BASE_URL = "https://graph.facebook.com/v20.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

export interface WaTextMessage {
  to: string;
  body: string;
}

async function post(endpoint: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export async function sendTextMessage(to: string, body: string) {
  return post(`/${PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

export async function markAsRead(messageId: string) {
  return post(`/${PHONE_ID}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

// Extrae mensajes entrantes del payload de webhook de Meta
export interface IncomingMessage {
  from: string;          // número E.164 sin +
  messageId: string;
  body: string;
  timestamp: number;
}

export function parseWebhookPayload(body: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  const entries = (body as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const msg of change?.value?.messages ?? []) {
        if (msg.type === "text") {
          messages.push({
            from: msg.from,
            messageId: msg.id,
            body: msg.text?.body ?? "",
            timestamp: Number(msg.timestamp),
          });
        }
      }
    }
  }
  return messages;
}
