import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { procesarContactoGHL, type GHLWebhookPayload } from "@/services/ghl";
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

export async function POST(request: NextRequest) {
  // Validar secret — puede venir como query param o header x-ghl-secret
  const secretQuery = request.nextUrl.searchParams.get("secret");
  const secretHeader = request.headers.get("x-ghl-secret");
  if (GHL_SECRET && secretQuery !== GHL_SECRET && secretHeader !== GHL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: GHLWebhookPayload;
  try {
    payload = (await request.json()) as GHLWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tipo = payload.type ?? "";
  if (!EVENTOS_CONTACTO.has(tipo)) {
    // Evento no relevante — aceptar sin procesar
    return NextResponse.json({ status: "ignored", type: tipo });
  }

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "webhook.ghl",
    fase:       "inicio",
    resultado:  tipo,
    metadata:   { event_type: tipo, contact_id: payload.contact_id ?? null },
  });

  after(async () => {
    try {
      await procesarContactoGHL(payload);
      void logSistema({ categoria: "webhook", tipoAccion: "webhook.ghl", fase: "ok", resultado: tipo, metadata: { event_type: tipo } });
    } catch (err) {
      console.error("[ghl/webhook] error procesando contacto:", err);
      void logSistema({ categoria: "webhook", tipoAccion: "webhook.ghl", fase: "error", resultado: err instanceof Error ? err.message.slice(0, 200) : "Error", metadata: { event_type: tipo, error_message: String(err) } });
    }
  });

  return NextResponse.json({ status: "ok" });
}
