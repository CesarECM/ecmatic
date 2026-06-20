// S18.2 — Flujo de comprobante de pago vía imagen
import { createServiceClient } from "@/lib/supabase/service";
import { moverLead } from "./pipeline";
import { enviarRespuestaWhatsApp } from "./whatsapp-sender";

export interface ComprobanteEnCola {
  id: string;
  telefono: string;
  wa_media_id: string | null;
  aprobado: boolean | null;
  notas_admin: string | null;
  created_at: string;
  lead_id: string | null;
  lead_nombre: string | null;
}

// Encola un comprobante recibido. Se llama antes del buffer, con solo el teléfono.
export async function encolarComprobante(params: {
  telefono: string;
  waMediaId?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("comprobantes_cola_revision").insert({
    telefono: params.telefono,
    wa_media_id: params.waMediaId ?? null,
  });
}

// Lista comprobantes pendientes con datos del lead (si ya existe).
export async function listarComprobantesPendientes(): Promise<ComprobanteEnCola[]> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("comprobantes_cola_revision")
    .select("*")
    .is("aprobado", null)
    .order("created_at");

  if (!data?.length) return [];

  // Enriquecer con datos del lead buscando por teléfono
  const telefonos: string[] = [...new Set<string>(data.map((c: any) => c.telefono as string))];
  const { data: leads } = await supabase
    .from("leads")
    .select("id, nombre, telefono")
    .in("telefono", telefonos);

  const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.telefono, l]));

  return data.map((c: any) => ({
    ...c,
    lead_id:     leadMap[c.telefono]?.id     ?? null,
    lead_nombre: leadMap[c.telefono]?.nombre ?? null,
  }));
}

// Aprueba el comprobante: mueve el lead a Comprado y marca como aprobado.
export async function aprobarComprobante(id: string, notas?: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: comp } = await (supabase as any)
    .from("comprobantes_cola_revision")
    .select("telefono")
    .eq("id", id)
    .single();

  if (!comp) throw new Error("[comprobantes] Comprobante no encontrado");

  const { data: lead } = await supabase
    .from("leads")
    .select("id, pipeline_ruta")
    .eq("telefono", comp.telefono)
    .maybeSingle();

  if (!lead) throw new Error("[comprobantes] Lead no encontrado para el teléfono");

  // Mover a Comprado (dispara cerrarTarea, etiquetas, nurturing, etc.)
  await moverLead(lead.id, "Comprado", "admin", "Comprobante de pago aprobado");

  await (supabase as any)
    .from("comprobantes_cola_revision")
    .update({ aprobado: true, notas_admin: notas ?? null })
    .eq("id", id);
}

// Rechaza el comprobante y notifica al lead por WhatsApp.
export async function rechazarComprobante(id: string, notas?: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: comp } = await (supabase as any)
    .from("comprobantes_cola_revision")
    .select("telefono")
    .eq("id", id)
    .single();

  if (!comp) throw new Error("[comprobantes] Comprobante no encontrado");

  await (supabase as any)
    .from("comprobantes_cola_revision")
    .update({ aprobado: false, notas_admin: notas ?? null })
    .eq("id", id);

  // Notificar al lead
  await enviarRespuestaWhatsApp(comp.telefono, [
    "No pudimos verificar tu comprobante de pago. Por favor revisa que la imagen sea legible e inténtalo de nuevo, o contáctanos directamente para ayudarte.",
  ]).catch(console.error);
}
