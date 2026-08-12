import { createServiceClient } from "@/lib/supabase/service";
import { obtenerOCrearConversacionWA, enviarMensajeGHLFragmentado } from "@/lib/ghl/conversations-api";

// Envía el contenido_final de un contact_point aprobado/editado vía GHL (WhatsApp)
export async function enviarPorGHL(cpId: string): Promise<void> {
  const db = createServiceClient() as any;

  const { data: cp } = await db
    .from("v2_contact_points")
    .select("estado, tipo, contenido_final, metadata, lead:v2_leads(ghl_contact_id)")
    .eq("id", cpId)
    .single();

  if (!cp) throw new Error("enviarPorGHL: contact_point no encontrado");
  if (!["aprobado", "editado"].includes(cp.estado)) {
    throw new Error(`enviarPorGHL: estado inválido (${cp.estado})`);
  }
  if (cp.tipo !== "whatsapp") throw new Error("enviarPorGHL: solo aplica para tipo=whatsapp");
  if (!cp.contenido_final?.trim()) throw new Error("enviarPorGHL: sin contenido_final para enviar");

  const ghlContactId = (cp.lead as { ghl_contact_id: string }).ghl_contact_id;
  if (!ghlContactId) throw new Error("enviarPorGHL: lead sin ghl_contact_id");

  const conversationId = await obtenerOCrearConversacionWA(ghlContactId);
  if (!conversationId) throw new Error("enviarPorGHL: no se pudo obtener conversación GHL");

  await enviarMensajeGHLFragmentado(conversationId, cp.contenido_final.trim(), ghlContactId);

  await db.from("v2_contact_points").update({
    estado:     "enviado",
    updated_at: new Date().toISOString(),
    metadata: {
      ...(cp.metadata ?? {}),
      enviado_at: new Date().toISOString(),
      canal:      "ghl_whatsapp",
    },
  }).eq("id", cpId);
}

// Auto-envía sin aprobación humana cuando confianza ≥ 92 (S150.1)
export async function autoEnviarPorGHL(cpId: string, contenido: string): Promise<void> {
  const db = createServiceClient() as any;

  const { data: cp } = await db
    .from("v2_contact_points")
    .select("tipo, metadata, lead:v2_leads(ghl_contact_id)")
    .eq("id", cpId)
    .single();

  if (!cp) throw new Error("autoEnviarPorGHL: contact_point no encontrado");
  if (cp.tipo !== "whatsapp") throw new Error("autoEnviarPorGHL: solo tipo=whatsapp");

  const ghlContactId = (cp.lead as { ghl_contact_id: string }).ghl_contact_id;
  if (!ghlContactId) throw new Error("autoEnviarPorGHL: lead sin ghl_contact_id");

  const conversationId = await obtenerOCrearConversacionWA(ghlContactId);
  if (!conversationId) throw new Error("autoEnviarPorGHL: no se pudo obtener conversación GHL");

  await enviarMensajeGHLFragmentado(conversationId, contenido.trim(), ghlContactId);

  await db.from("v2_contact_points").update({
    estado:          "enviado_automatico",
    contenido_final: contenido.trim(),
    updated_at:      new Date().toISOString(),
    metadata: {
      ...(cp.metadata ?? {}),
      enviado_at: new Date().toISOString(),
      canal:      "ghl_whatsapp_auto",
    },
  }).eq("id", cpId);
}

// Marca el contact_point como enviado manualmente (usuario envió desde WhatsApp personal u otro canal)
export async function marcarEnviadoManual(cpId: string): Promise<void> {
  const db = createServiceClient() as any;

  const { data: cp } = await db
    .from("v2_contact_points")
    .select("estado, metadata")
    .eq("id", cpId)
    .single();

  if (!cp) throw new Error("marcarEnviadoManual: contact_point no encontrado");
  if (!["aprobado", "editado"].includes(cp.estado)) {
    throw new Error(`marcarEnviadoManual: estado inválido (${cp.estado})`);
  }

  await db.from("v2_contact_points").update({
    estado:     "enviado_manual",
    updated_at: new Date().toISOString(),
    metadata: {
      ...(cp.metadata ?? {}),
      enviado_at: new Date().toISOString(),
      canal:      "manual",
    },
  }).eq("id", cpId);
}
