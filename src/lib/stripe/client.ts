import Stripe from "stripe";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export function isConfigured(): boolean {
  return !!(SECRET_KEY && WEBHOOK_SECRET);
}

function getStripe(): Stripe {
  if (!SECRET_KEY) throw new Error("[stripe] STRIPE_SECRET_KEY no configurada");
  return new Stripe(SECRET_KEY, { apiVersion: "2026-05-27.dahlia" });
}

// S8.1 — Crea una Checkout Session de Stripe para el lead
export async function crearCheckoutSession(params: {
  leadId: string;
  monto: number;       // en centavos MXN
  descripcion: string;
  emailLead?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "mxn",
    line_items: [{ price_data: { currency: "mxn", unit_amount: params.monto,
        product_data: { name: params.descripcion } }, quantity: 1 }],
    customer_email: params.emailLead ?? undefined,
    metadata: { lead_id: params.leadId },
    success_url: params.successUrl ?? `${appUrl}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl ?? `${appUrl}/pago-cancelado`,
  });

  if (!session.url) throw new Error("[stripe] No se recibió URL de sesión");
  return { url: session.url, sessionId: session.id };
}

// S8.2 — Verifica la firma del webhook y devuelve el evento
export function verificarWebhook(body: string | Buffer, signature: string): Stripe.Event {
  if (!WEBHOOK_SECRET) throw new Error("[stripe] STRIPE_WEBHOOK_SECRET no configurada");
  return getStripe().webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
}

// Obtiene la sesión de checkout completa con payment_intent expandido
export async function obtenerSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
}
