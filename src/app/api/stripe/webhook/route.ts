import { NextRequest, NextResponse } from "next/server";
import { verificarWebhook, obtenerSession } from "@/lib/stripe/client";
import { registrarPago } from "@/services/pagos";
import { createServiceClient } from "@/lib/supabase/service";
import Stripe from "stripe";

export const runtime = "nodejs";

// POST /api/stripe/webhook — S8.2: recibe eventos de Stripe
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = verificarWebhook(body, sig);
  } catch (err) {
    console.error("[stripe-webhook] Firma inválida:", err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const leadId = session.metadata?.lead_id;
      if (!leadId) return NextResponse.json({ ok: true });

      const sessionCompleta = await obtenerSession(session.id);
      const pi = sessionCompleta.payment_intent as Stripe.PaymentIntent | null;

      // Buscar vendedor asignado al lead
      const supabase = createServiceClient();
      const { data: lead } = await supabase
        .from("leads").select("vendedor_id").eq("id", leadId).single();

      await registrarPago({
        leadId,
        vendedorId: lead?.vendedor_id ?? null,
        monto: (session.amount_total ?? 0) / 100,
        metodo: "stripe",
        stripePaymentIntentId: pi?.id ?? undefined,
        stripeSessionId: session.id,
      });
    }
  } catch (err) {
    console.error("[stripe-webhook] Error procesando evento:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
