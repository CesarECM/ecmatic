import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { procesarContactoGHL, type GHLWebhookPayload } from "@/services/ghl";
import { resolverCuerpoGHL, encolarEnBuffer } from "@/services/ghl-message-buffer";
import { logSistema } from "@/services/log-sistema";

const GHL_SECRET = process.env.GHL_WEBHOOK_SECRET;

const EVENTOS_CONTACTO = new Set([
  "ContactCreate",
  "ContactUpdate",
  "contact.created",
  "contact.updated",
  "FormSubmission",
  "form.submitted",
  "OpportunityCreate",
  "opportunity.created",
]);

const EVENTOS_MENSAJE = new Set([
  "InboundMessage",
  "inbound.message",
  "inbound_message",
  "MESSAGE_RECEIVED",
  "message_received",
  "CustomerReplied",
  "customer_replied",
  "customer.replied",
]);

export async function POST(request: NextRequest) {
  const secretQuery  = request.nextUrl.searchParams.get("secret");
  const secretHeader = request.headers.get("x-ghl-secret");
  if (GHL_SECRET && secretQuery !== GHL_SECRET && secretHeader !== GHL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tipo = (payload.type ?? payload.event ?? "") as string;

  // GHL workflow webhooks no incluyen `type` ni body — solo contactId es suficiente
  const esMensajeWF = !tipo && !!payload.contactId;

  // Log diagnóstico: captura todo lo que llega al webhook
  void logSistema({
    categoria:  "webhook",
    tipoAccion: "webhook.ghl.raw",
    fase:       "inicio",
    resultado:  tipo || (esMensajeWF ? "(workflow-mensaje)" : "(sin tipo)"),
    metadata:   {
      type:           payload.type,
      event:          payload.event,
      messageType:    payload.messageType,
      contactId:      payload.contactId,
      conversationId: payload.conversationId,
      channel:        payload.channel,
      direction:      payload.direction,
      body_preview:   typeof payload.body === "string" ? payload.body.slice(0, 100) : null,
      keys:           Object.keys(payload),
    },
  });

  // ── Mensajes entrantes WA (respuestas a la campaña SBC) ─────────────────
  if (EVENTOS_MENSAJE.has(tipo) || esMensajeWF) {
    void logSistema({
      categoria:  "webhook",
      tipoAccion: "webhook.ghl.mensaje",
      fase:       "inicio",
      resultado:  tipo,
      metadata:   { contact_id: payload.contactId ?? null, conversation_id: payload.conversationId ?? null },
    });

    after(async () => {
      const contactId      = (payload.contactId ?? "") as string;
      const conversationId = (payload.conversationId ?? undefined) as string | undefined;
      try {
        const cuerpo = await resolverCuerpoGHL(payload, contactId, conversationId);
        await encolarEnBuffer({ contactId, conversationId, cuerpo });
      } catch (err) {
        void logSistema({
          categoria:  "webhook",
          tipoAccion: "webhook.ghl.mensaje",
          fase:       "error",
          resultado:  err instanceof Error ? err.message.slice(0, 200) : "Error",
          metadata:   { contact_id: contactId },
        });
      }
    });

    return NextResponse.json({ status: "ok" });
  }

  // ── Creación / actualización de contactos ────────────────────────────────
  if (!EVENTOS_CONTACTO.has(tipo)) {
    return NextResponse.json({ status: "ignored", type: tipo });
  }

  const contactPayload = payload as GHLWebhookPayload;

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "webhook.ghl",
    fase:       "inicio",
    resultado:  tipo,
    metadata:   { event_type: tipo, contact_id: contactPayload.contact_id ?? null },
  });

  after(async () => {
    try {
      await procesarContactoGHL(contactPayload);
      void logSistema({ categoria: "webhook", tipoAccion: "webhook.ghl", fase: "ok", resultado: tipo, metadata: { event_type: tipo } });
    } catch (err) {
      void logSistema({ categoria: "webhook", tipoAccion: "webhook.ghl", fase: "error", resultado: err instanceof Error ? err.message.slice(0, 200) : "Error", metadata: { event_type: tipo, error_message: String(err) } });
    }
  });

  return NextResponse.json({ status: "ok" });
}
