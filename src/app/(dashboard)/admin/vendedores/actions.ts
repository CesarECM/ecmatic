"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { logSistema } from "@/services/log-sistema";

export async function actualizarPesoAction(vendedorId: string, peso: number): Promise<void> {
  if (!Number.isInteger(peso) || peso < 0 || peso > 100) throw new Error("Peso fuera de rango (0–100)");
  const supabase = createServiceClient();
  const { error } = await supabase.from("vendedores").update({ peso }).eq("id", vendedorId);
  if (error) throw new Error(`[vendedores] ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "vendedores.actualizar-peso", fase: "ok", metadata: { vendedor_id: vendedorId, peso } });
  revalidatePath("/admin/vendedores");
}

// S25.0 — Agrega un vendedor nuevo o promueve un usuario existente
export async function agregarVendedorAction(nombre: string, email: string): Promise<void> {
  const trimNombre = nombre.trim();
  const trimEmail = email.trim().toLowerCase();
  if (!trimNombre || !trimEmail) throw new Error("Nombre y email son requeridos");

  const supabase = createServiceClient();

  // Intentar invitar; si ya existe el usuario, buscar su profile por email
  let profileId: string;
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(trimEmail);

  if (inviteError) {
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("email", trimEmail).maybeSingle();
    if (!profile) {
      void logSistema({ categoria: "ui", tipoAccion: "vendedores.agregar", fase: "error", resultado: inviteError.message, metadata: { email: trimEmail } });
      throw new Error(`No se pudo crear el usuario: ${inviteError.message}`);
    }
    profileId = profile.id;
  } else {
    profileId = inviteData.user.id;
  }

  const { error } = await supabase.from("vendedores").insert({ profile_id: profileId, nombre: trimNombre, email: trimEmail });
  if (error) {
    const msg = error.message.toLowerCase().includes("unique")
      ? "Este usuario ya está registrado como vendedor"
      : `[vendedores] ${error.message}`;
    void logSistema({ categoria: "ui", tipoAccion: "vendedores.agregar", fase: "error", resultado: msg, metadata: { email: trimEmail } });
    throw new Error(msg);
  }

  void logSistema({ categoria: "ui", tipoAccion: "vendedores.agregar", fase: "ok", resultado: trimNombre, metadata: { email: trimEmail } });
  revalidatePath("/admin/vendedores");
}

// S86.1 — Guarda el ID de calendario GHL del vendedor
export async function actualizarCalendarioGhlAction(vendedorId: string, ghlCalendarId: string): Promise<void> {
  const trimId = ghlCalendarId.trim();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("vendedores")
    .update({ ghl_calendar_id: trimId || null })
    .eq("id", vendedorId);
  if (error) throw new Error(`[vendedores] ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "vendedores.actualizar-calendario-ghl", fase: "ok",
    metadata: { vendedor_id: vendedorId, tiene_id: !!trimId } });
  revalidatePath(`/admin/vendedores/${vendedorId}`);
}

// S25.0b — Reenvía la invitación a un vendedor que aún no ha aceptado
export async function reenviarInvitacionAction(email: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email.trim().toLowerCase());
  if (error) {
    void logSistema({ categoria: "ui", tipoAccion: "vendedores.reenviar-invitacion", fase: "error", resultado: error.message, metadata: { email } });
    throw new Error(`[invitación] ${error.message}`);
  }
  void logSistema({ categoria: "ui", tipoAccion: "vendedores.reenviar-invitacion", fase: "ok", metadata: { email } });
}
