const BASE_URL = "https://graph.facebook.com/v20.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// Envía con retry exponencial (1s / 2s / 4s). Lanza si todos los intentos fallan.
export async function sendTextMessageWithRetry(to: string, body: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await sendTextMessage(to, body);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastErr;
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
  mediaId?: string;      // presente solo en mensajes de audio
  mimeType?: string;
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
        } else if (msg.type === "audio") {
          messages.push({
            from: msg.from,
            messageId: msg.id,
            body: "",
            timestamp: Number(msg.timestamp),
            mediaId: msg.audio?.id,
            mimeType: msg.audio?.mime_type,
          });
        }
      }
    }
  }
  return messages;
}

// Descarga el binario de un media de WhatsApp en dos pasos:
// 1) obtiene la URL temporal de descarga, 2) descarga el archivo
export async function descargarMediaWA(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Meta media info error ${metaRes.status}`);
  }
  const { url, mime_type } = (await metaRes.json()) as {
    url: string;
    mime_type: string;
  };

  const audioRes = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!audioRes.ok) {
    throw new Error(`Media download error ${audioRes.status}`);
  }

  const arrayBuffer = await audioRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: mime_type };
}
