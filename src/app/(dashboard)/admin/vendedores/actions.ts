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
