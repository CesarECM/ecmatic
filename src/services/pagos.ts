import { createServiceClient } from "@/lib/supabase/service";
import { crearCheckoutSession, isConfigured } from "@/lib/stripe/client";
import { moverLead } from "@/services/pipeline";
import { calcularComision } from "@/services/comisiones";
import { enviarBienvenida } from "@/lib/email/transaccional";
import { altaAccesoSmartBuilder } from "@/services/smartbuilder";
import type { MetodoPago, EstadoPago } from "@/lib/supabase/types";

export interface DatosPago {
  leadId: string;
  vendedorId?: string | null;
  monto: number;
  metodo: MetodoPago;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  comprobanteUrl?: string;
  notas?: string;
}

// S8.1 — Genera link de pago Stripe para el lead
export async function generarLinkStripe(leadId: string): Promise<string | null> {
  if (!isConfigured()) return null;
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("nombre, email, pipeline_ruta")
    .eq("id", leadId)
    .single();

  const monto = lead?.pipeline_ruta === "premium" ? 1_000_000 : 179_900; // centavos MXN
  const descripcion = lead?.pipeline_ruta === "premium"
    ? "Certificación CONOCER Premium — Centro ECM"
    : "Certificación CONOCER Tripwire $1,799 — Centro ECM";

  const { url } = await crearCheckoutSession({
    leadId, monto, descripcion, emailLead: lead?.email,
  });
  return url;
}

// S8.2 / S8.3 — Registra un pago y dispara el flujo post-compra
export async function registrarPago(datos: DatosPago): Promise<string> {
  const supabase = createServiceClient();

  const { data: pago, error } = await supabase.from("pagos").insert({
    lead_id: datos.leadId,
    vendedor_id: datos.vendedorId ?? null,
    monto: datos.monto,
    metodo: datos.metodo,
    stripe_payment_intent_id: datos.stripePaymentIntentId ?? null,
    stripe_session_id: datos.stripeSessionId ?? null,
    comprobante_url: datos.comprobanteUrl ?? null,
    estado: "completado" as EstadoPago,
    notas: datos.notas ?? null,
  }).select("id").single();

  if (error || !pago) throw new Error(`[pagos] Error registrando: ${error?.message}`);

  // S8.5 — Calcular comisión si hay vendedor asignado
  if (datos.vendedorId) {
    void calcularComision(pago.id, datos.vendedorId, datos.monto).catch(console.error);
  }

  // Mover lead a "Comprado" y enviar email de bienvenida
  void flujoPostCompra(datos.leadId).catch(console.error);

  return pago.id;
}

async function flujoPostCompra(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("nombre, email, pipeline_ruta")
    .eq("id", leadId)
    .single();

  await moverLead(leadId, "Comprado", "webhook");

  // S9.1 — Alta en SmartBuilderEC (fire-and-forget)
  void altaAccesoSmartBuilder(leadId).catch(console.error);

  if (lead?.email) {
    await enviarBienvenida({ nombre: lead.nombre, email: lead.email }).catch(console.error);
  }
}

// S8.6 — Lista pagos con filtros opcionales para el panel financiero
export async function listarPagos(filtros?: {
  desde?: string; hasta?: string; metodo?: MetodoPago;
}) {
  const supabase = createServiceClient();
  let q = supabase
    .from("pagos")
    .select("*, leads(nombre, telefono, pipeline_ruta), vendedores(nombre)")
    .order("created_at", { ascending: false });

  if (filtros?.desde) q = q.gte("created_at", filtros.desde);
  if (filtros?.hasta) q = q.lte("created_at", filtros.hasta);
  if (filtros?.metodo) q = q.eq("metodo", filtros.metodo);

  const { data, error } = await q;
  if (error) throw new Error(`[pagos] ${error.message}`);
  return data ?? [];
}

export async function resumenIngresos(desde: string, hasta: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("pagos")
    .select("monto, metodo, leads(pipeline_ruta)")
    .eq("estado", "completado")
    .gte("created_at", desde)
    .lte("created_at", hasta);

  const total = (data ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const porMetodo = { stripe: 0, manual: 0 };
  const porRuta = { tripwire: 0, premium: 0 };

  for (const p of data ?? []) {
    porMetodo[p.metodo as MetodoPago] += Number(p.monto);
    const ruta = (p.leads as unknown as { pipeline_ruta: string } | null)?.pipeline_ruta;
    if (ruta === "tripwire" || ruta === "premium") porRuta[ruta] += Number(p.monto);
  }

  return { total, porMetodo, porRuta, totalPagos: data?.length ?? 0 };
}
