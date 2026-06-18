import { type NextRequest, NextResponse } from "next/server";
import { parseWebhookPayload, markAsRead } from "@/lib/whatsapp/client";
import { encolarMensaje } from "@/services/mensajes";

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

  // Meta espera 200 inmediato — procesamos en background
  const messages = parseWebhookPayload(body);

  // Procesamos sin await para responder rápido a Meta
  Promise.all(
    messages.map(async (msg) => {
      try {
        await markAsRead(msg.messageId);
        await encolarMensaje(msg);
      } catch (err) {
        console.error("[webhook] error procesando mensaje", err);
      }
    })
  );

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
