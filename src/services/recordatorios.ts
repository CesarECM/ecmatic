import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";

// S7.4 — Envía recordatorios 24h y 2h antes al lead, y 30min antes al vendedor
export async function enviarRecordatoriosCitas(): Promise<{ enviados: number }> {
  const supabase = createServiceClient();
  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const en2h = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);
  const en30m = new Date(ahora.getTime() + 30 * 60 * 1000);
  let enviados = 0;

  // Recordatorio 24h al lead
  const { data: citas24h } = await supabase
    .from("citas")
    .select("id, lead_id, fecha_inicio, google_meet_link, leads(nombre, telefono), vendedores(nombre)")
    .in("estado", ["pendiente", "confirmada"])
    .eq("recordatorio_24h", false)
    .gte("fecha_inicio", ahora.toISOString())
    .lte("fecha_inicio", en24h.toISOString());

  for (const c of citas24h ?? []) {
    const lead = c.leads as unknown as { nombre: string | null; telefono: string | null } | null;
    const vendedor = c.vendedores as unknown as { nombre: string } | null;
    if (!lead?.telefono) continue;
    const fecha = new Date(c.fecha_inicio).toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short" });
    const msg = `¡Hola${lead.nombre ? ` ${lead.nombre}` : ""}! 🎓 Te recordamos tu cita con ${vendedor?.nombre ?? "tu asesor"} mañana: *${fecha}*${c.google_meet_link ? `\n📹 ${c.google_meet_link}` : ""}`;
    try {
      await sendTextMessage(lead.telefono, msg);
      await supabase.from("citas").update({ recordatorio_24h: true }).eq("id", c.id);
      enviados++;
    } catch { /* no bloquear */ }
  }

  // Recordatorio 2h al lead
  const { data: citas2h } = await supabase
    .from("citas")
    .select("id, lead_id, fecha_inicio, google_meet_link, leads(nombre, telefono), vendedores(nombre)")
    .in("estado", ["pendiente", "confirmada"])
    .eq("recordatorio_2h", false)
    .gte("fecha_inicio", ahora.toISOString())
    .lte("fecha_inicio", en2h.toISOString());

  for (const c of citas2h ?? []) {
    const lead = c.leads as unknown as { nombre: string | null; telefono: string | null } | null;
    const vendedor = c.vendedores as unknown as { nombre: string } | null;
    if (!lead?.telefono) continue;
    const hora = new Date(c.fecha_inicio).toLocaleTimeString("es-MX", { timeStyle: "short" });
    const msg = `⏰ En 2 horas tu asesoría con ${vendedor?.nombre ?? "tu asesor"} a las *${hora}*${c.google_meet_link ? `\n📹 ${c.google_meet_link}` : ""}. ¡Te esperamos!`;
    try {
      await sendTextMessage(lead.telefono, msg);
      await supabase.from("citas").update({ recordatorio_2h: true }).eq("id", c.id);
      enviados++;
    } catch { /* no bloquear */ }
  }

  // Recordatorio 30min al vendedor (WhatsApp personal)
  const { data: citas30m } = await supabase
    .from("citas")
    .select("id, fecha_inicio, google_meet_link, leads(nombre), vendedores(nombre, profile_id)")
    .in("estado", ["pendiente", "confirmada"])
    .eq("recordatorio_vendedor_30m", false)
    .gte("fecha_inicio", ahora.toISOString())
    .lte("fecha_inicio", en30m.toISOString());

  for (const c of citas30m ?? []) {
    const lead = c.leads as unknown as { nombre: string | null } | null;
    const vendedor = c.vendedores as unknown as { nombre: string; profile_id: string } | null;
    if (!vendedor?.profile_id) continue;
    const { data: profile } = await supabase
      .from("profiles").select("whatsapp_personal").eq("id", vendedor.profile_id).single();
    if (!profile?.whatsapp_personal) continue;
    const msg = `🔔 En 30 min: cita con *${lead?.nombre ?? "Lead"}*${c.google_meet_link ? `\n📹 ${c.google_meet_link}` : ""}`;
    try {
      await sendTextMessage(profile.whatsapp_personal, msg);
      await supabase.from("citas").update({ recordatorio_vendedor_30m: true }).eq("id", c.id);
      enviados++;
    } catch { /* no bloquear */ }
  }

  return { enviados };
}
