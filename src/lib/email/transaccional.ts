import { enviarEmail } from "./resend";
import { interceptarOEnviarEmail } from "@/services/bandeja-email";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "cesar@ceecm.mx";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
const SITE_URL = "https://ceecm.mx";

function plantillaBase(titulo: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <div style="background:#1e3a5f;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">Centro ECM</h1>
    <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">Certificaciones CONOCER</p>
  </div>
  <div style="padding:32px 40px">
    <h2 style="color:#1e3a5f;margin-top:0;font-size:20px">${titulo}</h2>
    ${cuerpo}
  </div>
  <div style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#999">
    Centro ECM &middot; <a href="${SITE_URL}" style="color:#1e3a5f">${SITE_URL}</a> &middot; +52 1 443 123 7032
  </div>
</div>
</body></html>`;
}

function boton(href: string, texto: string): string {
  return `<p style="margin-top:28px"><a href="${href}" style="background:#1e3a5f;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px">${texto}</a></p>`;
}

// S4.2 — Bienvenida al lead en su primer contacto
export async function enviarBienvenida(lead: {
  nombre: string | null;
  email: string | null;
  leadId?: string;
}): Promise<void> {
  if (!lead.email) return;
  const nombre = lead.nombre ?? "Candidato";
  await interceptarOEnviarEmail({
    to: lead.email,
    subject: "¡Bienvenido a Centro ECM! — Tu certificación CONOCER",
    leadId: lead.leadId,
    tipo: "bienvenida",
    html: plantillaBase(
      `¡Hola, ${nombre}!`,
      `<p style="color:#444;line-height:1.6">Gracias por tu interés en certificarte con <strong>CONOCER</strong>. En Centro ECM te acompañamos en cada paso: diagnóstico, preparación y obtención de tu certificado oficial.</p>
       <p style="color:#444;line-height:1.6">Un asesor te contactará en breve para conocer tu situación y orientarte <strong>sin compromiso</strong>.</p>
       <p style="color:#444;line-height:1.6">Si tienes alguna pregunta, puedes escribirnos directamente por WhatsApp.</p>
       ${boton(SITE_URL, "Conocer más sobre el proceso")}`
    ),
  });
}

// S4.2 — Alerta al admin cuando se abre un ticket de handoff
export async function enviarNotificacionTicket(ticket: {
  id: string;
  motivo: string;
  lead_nombre: string | null;
  lead_telefono: string | null;
}): Promise<void> {
  const nombre = ticket.lead_nombre ?? "Lead sin nombre";
  const tel = ticket.lead_telefono ?? "—";
  await enviarEmail({
    to: ADMIN_EMAIL,
    subject: `[ECMatic] Ticket nuevo: ${nombre}`,
    html: plantillaBase(
      "Nuevo ticket de atención humana",
      `<p style="color:#444">Se abrió un ticket que requiere tu atención personal:</p>
       <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
         <tr><td style="padding:10px 8px;color:#666;width:130px;border-bottom:1px solid #eee">Lead</td><td style="padding:10px 8px;font-weight:bold;border-bottom:1px solid #eee">${nombre}</td></tr>
         <tr><td style="padding:10px 8px;color:#666;border-bottom:1px solid #eee">Teléfono</td><td style="padding:10px 8px;border-bottom:1px solid #eee">${tel}</td></tr>
         <tr><td style="padding:10px 8px;color:#666">Motivo</td><td style="padding:10px 8px">${ticket.motivo}</td></tr>
       </table>
       ${boton(`${APP_URL}/admin/tickets`, "Ver ticket en ECMatic")}`
    ),
  });
}

// S4.2 — Email de nurturing (seguimiento o re-engagement)
export async function enviarEmailNurturing(
  lead: { nombre: string | null; email: string | null; leadId?: string },
  mensajePlantilla: string
): Promise<void> {
  if (!lead.email) return;
  const nombre = lead.nombre ?? "Candidato";
  const cuerpo = mensajePlantilla.replace(/\{nombre\}/gi, nombre);
  await interceptarOEnviarEmail({
    to: lead.email,
    subject: "Centro ECM — Seguimiento a tu certificación CONOCER",
    leadId: lead.leadId,
    tipo: "nurturing",
    html: plantillaBase(
      `Hola, ${nombre}`,
      `<p style="color:#444;line-height:1.6">${cuerpo}</p>
       ${boton(SITE_URL, "Responder por WhatsApp")}`
    ),
  });
}
