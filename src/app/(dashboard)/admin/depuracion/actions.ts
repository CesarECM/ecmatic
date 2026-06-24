"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { logDebugIA } from "@/services/log-ia";
import { marcarEmailLeido } from "@/services/bandeja-email";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function crearLeadRealAction(formData: FormData): Promise<void> {
  const modo = await obtenerModo();
  if (modo !== "depuracion") throw new Error("Solo disponible en modo Depuración");

  const nombre  = (formData.get("nombre")  as string | null)?.trim() || null;
  const telefono = (formData.get("telefono") as string | null)?.trim();
  const email   = (formData.get("email")   as string | null)?.trim() || null;
  const canal   = (formData.get("canal")   as string | null) ?? "whatsapp";

  if (!telefono) throw new Error("El teléfono es requerido");

  const supabase = createServiceClient();

  // Reusar lead existente o crear uno nuevo
  const { data: existente } = await supabase
    .from("leads")
    .select("id, metadata")
    .eq("telefono", telefono)
    .maybeSingle();

  let leadId: string;

  if (existente) {
    await supabase.from("leads").update({
      ...(nombre && { nombre }),
      ...(email  && { email }),
      canal_origen: canal,
      metadata: { ...(existente.metadata as object ?? {}), ingresado_depuracion: true },
    }).eq("id", existente.id).throwOnError();
    leadId = existente.id;
  } else {
    const { data: nuevo, error } = await supabase.from("leads").insert({
      telefono,
      nombre,
      email,
      canal_origen: canal,
      metadata: { ingresado_depuracion: true, ingresado_at: new Date().toISOString() },
    }).select("id").single();
    if (error) throw new Error(`[depuracion] ${error.message}`);
    leadId = nuevo.id;
  }

  void logDebugIA(
    "DEPURACION_LEAD_CREADO",
    `[DEPURACION] Lead real ingresado manualmente: ${telefono}`,
    { lead_id: leadId, canal, tiene_nombre: !!nombre, tiene_email: !!email, es_nuevo: !existente }
  );

  redirect(`/admin/leads/${leadId}`);
}

export async function marcarEmailLeidoAction(id: string): Promise<void> {
  await marcarEmailLeido(id);
  revalidatePath("/admin/depuracion");
  revalidatePath("/admin/leads");
}
