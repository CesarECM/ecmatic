"use server";

import { revalidatePath } from "next/cache";
import { cerrarTicket } from "@/services/tickets";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/client";

export async function responderTicketAction(formData: FormData) {
  const ticketId = formData.get("ticketId") as string;
  const leadId = formData.get("leadId") as string;
  const telefono = formData.get("telefono") as string;
  const respuesta = formData.get("respuesta") as string;

  if (!respuesta.trim()) return;

  // Enviar respuesta por WhatsApp
  await sendTextMessage(telefono, respuesta);

  // S1.12 — Generar sugerencia de KB con IA
  const sugerencia = await generarSugerenciaKb(respuesta);

  await cerrarTicket(ticketId, respuesta, sugerencia ?? undefined);

  // Marcar ticket en atención primero, luego cerrado
  revalidatePath("/dashboard/admin/tickets");
}

export async function tomarTicketAction(formData: FormData) {
  const ticketId = formData.get("ticketId") as string;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const serviceClient = createServiceClient();
  const { data: vendedor } = await serviceClient
    .from("vendedores")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  await serviceClient
    .from("tickets")
    .update({ estado: "en_atencion", vendedor_id: vendedor?.id ?? null })
    .eq("id", ticketId);

  revalidatePath("/dashboard/admin/tickets");
}

// S1.12 — Sugiere actualización/creación de recurso en base de conocimiento
async function generarSugerenciaKb(resolucion: string) {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: `Analiza la resolución de un ticket de soporte y determina si debería crear o actualizar un recurso en la base de conocimiento.
Responde en JSON con este formato exacto:
{"crear": true, "tipo": "faq|objecion|practica_venta", "titulo": "...", "contenido": "..."}
Si no hay nada útil que agregar, responde: {"crear": false}`,
      messages: [{ role: "user", content: `Resolución del ticket:\n${resolucion}` }],
    });

    const raw = (response.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw);
    if (!json.crear) return null;
    return { tipo: json.tipo, titulo: json.titulo, contenido: json.contenido };
  } catch {
    return null;
  }
}
