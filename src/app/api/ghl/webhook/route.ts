import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { procesarContactoGHL, type GHLWebhookPayload } from "@/services/ghl";

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

  after(async () => {
    try {
      await procesarContactoGHL(payload);
    } catch (err) {
      console.error("[ghl/webhook] error procesando contacto:", err);
    }
  });

  return NextResponse.json({ status: "ok" });
}
