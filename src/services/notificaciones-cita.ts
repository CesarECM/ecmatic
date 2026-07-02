// S25.4 — Notifica al lead y al vendedor cuando una cita queda confirmada con link de Meet
// S84.3 — WA al lead desactivado: el workflow de GHL envía la confirmación automáticamente.
//          Email al lead y email al vendedor se mantienen en ECMatic.
import { createServiceClient } from "@/lib/supabase/service";
import { enviarEmail } from "@/lib/email/resend";
import { logAgen } from "@/services/log-agendamiento";

function formatearFechaHora(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  const tz = "America/Mexico_City";
  const fecha = d.toLocaleDateString("es-MX", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const hora = d.toLocaleTimeString("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  return { fecha, hora };
}

export async function notificarCitaConfirmada(
  citaId: string,
  leadId: string,
  vendedorId: string,
  meetLink: string
): Promise<void> {
  const supabase = createServiceClient();
  const [{ data: lead }, { data: vendedor }, { data: cita }] = await Promise.all([
    supabase.from("leads").select("nombre, telefono, email").eq("id", leadId).single(),
    supabase.from("vendedores").select("nombre, email").eq("id", vendedorId).single(),
    supabase.from("citas").select("fecha_inicio").eq("id", citaId).single(),
  ]);
  if (!cita) return;

  const { fecha, hora } = formatearFechaHora(cita.fecha_inicio);
  const nombreLead = lead?.nombre ?? "ahí";

  // WhatsApp al lead: omitido — el workflow de GHL dispara la confirmación automáticamente
  void logAgen({ paso: "wa_omitido_ghl_workflow", citaId, leadId, vendedorId,
    detalle: "WA de confirmación delegado al workflow de GHL", metadata: { fecha, hora } });

  // Email al lead
  if (lead?.email) {
    await enviarEmail({
      to: lead.email,
      subject: "Tu cita de asesoría está confirmada",
      html: `<p>Hola ${nombreLead},</p>
<p>Tu cita de asesoría para certificación CONOCER está confirmada.</p>
<p>📅 <strong>${fecha} a las ${hora}</strong></p>
<p>🎥 <a href="${meetLink}">Unirse a Google Meet</a></p>
<p>¡Te esperamos!</p>`,
    })
      .then(() => void logAgen({ paso: "notificacion_email_lead", citaId, leadId, vendedorId,
        detalle: `Email enviado a ${lead.email}` }))
      .catch((err: unknown) => void logAgen({ paso: "notificacion_email_lead", nivel: "error", citaId, leadId, vendedorId,
        detalle: err instanceof Error ? err.message : String(err) }));
  }

  // Email al vendedor
  if (vendedor?.email) {
    await enviarEmail({
      to: vendedor.email,
      subject: `Cita confirmada — ${lead?.nombre ?? "Lead"} — ${fecha}`,
      html: `<p>Hola ${vendedor.nombre},</p>
<p>Tienes una cita confirmada:</p>
<p>👤 <strong>${lead?.nombre ?? "Lead"}</strong></p>
<p>📅 <strong>${fecha} a las ${hora}</strong></p>
<p>🎥 <a href="${meetLink}">Google Meet</a></p>`,
    })
      .then(() => void logAgen({ paso: "notificacion_email_vendedor", citaId, leadId, vendedorId,
        detalle: `Email enviado a ${vendedor.email}` }))
      .catch((err: unknown) => void logAgen({ paso: "notificacion_email_vendedor", nivel: "error", citaId, leadId, vendedorId,
        detalle: err instanceof Error ? err.message : String(err) }));
  }
}
