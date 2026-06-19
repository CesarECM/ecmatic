import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { generarEmbedding } from "@/lib/ai/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
const REVIEW_URLS = {
  google:      process.env.REVIEW_URL_GOOGLE ?? "",
  trustpilot:  process.env.REVIEW_URL_TRUSTPILOT ?? "",
  facebook:    process.env.REVIEW_URL_FACEBOOK ?? "",
};

// S9.7 — Detecta promotores (leads satisfechos) y solicita reseña
export async function solicitarReseña(leadId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads").select("nombre, telefono").eq("id", leadId).single();
  if (!lead?.telefono) return false;

  const links = [REVIEW_URLS.google, REVIEW_URLS.trustpilot, REVIEW_URLS.facebook]
    .filter(Boolean).join("\n");

  const msg = `🌟 ¡Felicidades${lead.nombre ? ` ${lead.nombre}` : ""} por tu certificación CONOCER! Tu opinión es muy valiosa para nosotros. ¿Nos regalas una reseña?\n\n${links || "Tu asesor te enviará el link directo."}`;

  try {
    await sendTextMessage(lead.telefono, msg);
    // Marcar en metadata que ya se solicitó reseña
    const { data: actual } = await supabase.from("leads")
      .select("metadata").eq("id", leadId).single();
    const meta = (actual?.metadata ?? {}) as Record<string, unknown>;
    await supabase.from("leads")
      .update({ metadata: { ...meta, reseña_solicitada: true, reseña_fecha: new Date().toISOString() } })
      .eq("id", leadId);
    return true;
  } catch { return false; }
}

// S9.8 — Genera código de referido único y envía mensaje al lead certificado
export async function generarReferido(leadId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads").select("nombre, telefono").eq("id", leadId).single();
  if (!lead?.telefono) return null;

  const codigo = `REF-${leadId.slice(0, 8).toUpperCase()}`;

  await supabase.from("referidos").upsert(
    { lead_id: leadId, codigo },
    { onConflict: "codigo" }
  );

  const linkReferido = `${APP_URL}/?ref=${codigo}`;
  const msg = `🎉 ¡Gracias${lead.nombre ? ` ${lead.nombre}` : ""} por certificarte con Centro ECM! Si conoces a alguien interesado en certificarse, comparte este link y obtendrás beneficios exclusivos:\n\n${linkReferido}`;

  try {
    await sendTextMessage(lead.telefono, msg);
    return codigo;
  } catch { return null; }
}

// S9.9 — Detecta leads 30 días post-compra y envía propuesta de upsell por IA
export async function ejecutarUpsell(): Promise<{ enviados: number }> {
  const supabase = createServiceClient();
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const hace31dias = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pagos } = await supabase
    .from("pagos")
    .select("lead_id, leads(nombre, telefono, pipeline_ruta, metadata)")
    .eq("estado", "completado")
    .gte("created_at", hace31dias)
    .lte("created_at", hace30dias);

  let enviados = 0;

  for (const pago of pagos ?? []) {
    const lead = pago.leads as unknown as {
      nombre: string | null; telefono: string | null;
      pipeline_ruta: string; metadata: Record<string, unknown>;
    } | null;
    if (!lead?.telefono) continue;
    if (lead.metadata?.upsell_enviado) continue;

    try {
      const embedding = await generarEmbedding(`upsell servicios relacionados ${lead.pipeline_ruta}`);
      const { data: recursos } = await supabase.rpc("buscar_recursos", {
        query_embedding: embedding, limite: 1, umbral: 0.5,
      });
      if (!recursos?.length) continue;
      const servicio = recursos[0];
      const msg = `Hola${lead.nombre ? ` ${lead.nombre}` : ""} 👋 Ahora que ya estás certificado, te podría interesar dar el siguiente paso: *${servicio.titulo}*. ¿Te gustaría saber más?`;
      await sendTextMessage(lead.telefono, msg);

      const { data: actual } = await supabase.from("leads")
        .select("metadata").eq("id", pago.lead_id).single();
      const meta = (actual?.metadata ?? {}) as Record<string, unknown>;
      await supabase.from("leads")
        .update({ metadata: { ...meta, upsell_enviado: true } })
        .eq("id", pago.lead_id);
      enviados++;
    } catch { /* no bloquear */ }
  }
  return { enviados };
}
