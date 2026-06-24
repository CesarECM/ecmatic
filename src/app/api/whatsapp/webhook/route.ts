import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { parseWebhookPayload, markAsRead } from "@/lib/whatsapp/client";
import { procesarMensajeEntrante } from "@/services/mensajes";
import { logSistema } from "@/services/log-sistema";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;

// GET — verificación del webhook en Meta Business Manager
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — mensajes entrantes de WhatsApp
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = parseWebhookPayload(body);
  if (messages.length === 0) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  void logSistema({
    categoria:   "webhook",
    tipoAccion:  "webhook.whatsapp",
    fase:        "inicio",
    resultado:   `${messages.length} mensaje(s) recibido(s)`,
    metadata:    { count: messages.length, from: messages[0]?.from, types: messages.map(m => m.mediaType ?? "text") },
  });

  // after() garantiza que el código corre después del 200
  // incluso en Vercel serverless — sin perder el contexto de ejecución
  after(async () => {
    for (const msg of messages) {
      try {
        await markAsRead(msg.messageId);
        await procesarMensajeEntrante(msg);
      } catch (err) {
        console.error("[webhook] error procesando mensaje:", err);
        void logSistema({
          categoria:  "webhook",
          tipoAccion: "webhook.whatsapp",
          fase:       "error",
          resultado:  err instanceof Error ? err.message.slice(0, 300) : "Error desconocido",
          metadata:   { from: msg.from, messageId: msg.messageId, error_message: String(err) },
        });
      }
    }
  });

  // Meta requiere 200 inmediato
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
