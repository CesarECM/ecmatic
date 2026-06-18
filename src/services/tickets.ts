import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_PERSONAL ?? "";

// S1.10 — Crea ticket de handoff y notifica al admin
export async function crearTicketHandoff(leadId: string, motivo: string) {
  const supabase = createServiceClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({ lead_id: leadId, motivo })
    .select()
    .single();

  if (error) {
    console.error("[tickets] Error creando ticket:", error.message);
    return null;
  }

  // Notifica al admin por WhatsApp personal si está configurado
  if (ADMIN_WHATSAPP) {
    const { data: lead } = await supabase
      .from("leads")
      .select("nombre, telefono")
      .eq("id", leadId)
      .single();

    const nombreLead = lead?.nombre ?? lead?.telefono ?? "Lead desconocido";
    await sendTextMessage(
      ADMIN_WHATSAPP,
      `⚠️ ECMatic necesita tu atención\n\nLead: ${nombreLead}\nMotivo: ${motivo}\n\nAbre el panel para responder.`
    ).catch(console.error);
  }

  return ticket;
}

// S1.12 — Genera sugerencia de KB al cerrar ticket
export async function cerrarTicket(
  ticketId: string,
  resolucion: string,
  sugerenciaKb?: { tipo: string; titulo: string; contenido: string }
) {
  const supabase = createServiceClient();

  await supabase
    .from("tickets")
    .update({
      estado: "cerrado",
      resolucion,
      sugerencia_kb: sugerenciaKb ?? null,
    })
    .eq("id", ticketId);
}
