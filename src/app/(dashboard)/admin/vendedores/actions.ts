"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export async function actualizarPesoAction(vendedorId: string, peso: number): Promise<void> {
  if (!Number.isInteger(peso) || peso < 0 || peso > 100) throw new Error("Peso fuera de rango (0–100)");
  const supabase = createServiceClient();
  const { error } = await supabase.from("vendedores").update({ peso }).eq("id", vendedorId);
  if (error) throw new Error(`[vendedores] ${error.message}`);
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
    if (!profile) throw new Error(`No se pudo crear el usuario: ${inviteError.message}`);
    profileId = profile.id;
  } else {
    profileId = inviteData.user.id;
  }

  const { error } = await supabase.from("vendedores").insert({ profile_id: profileId, nombre: trimNombre, email: trimEmail });
  if (error) {
    const msg = error.message.toLowerCase().includes("unique")
      ? "Este usuario ya está registrado como vendedor"
      : `[vendedores] ${error.message}`;
    throw new Error(msg);
  }

  revalidatePath("/admin/vendedores");
}
