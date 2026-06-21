"use server";

import { revalidatePath } from "next/cache";
import { aprobarCelda, crearCelda } from "@/services/matriz";
import { sugerirCeldasVacias } from "@/services/matriz-ia";
import { createServiceClient } from "@/lib/supabase/service";
import type { DimensionesMatriz } from "@/lib/supabase/types";

export async function aprobarCeldaAction(id: string): Promise<void> {
  await aprobarCelda(id);
  revalidatePath("/admin/matriz");
}

export async function actualizarCeldaAction(id: string, respuesta: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ respuesta_sugerida: respuesta }).eq("id", id);
  revalidatePath("/admin/matriz");
}

export async function rechazarCeldaAction(id: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").delete().eq("id", id);
  revalidatePath("/admin/matriz");
}

export async function crearCeldaManualAction(
  dimensiones: DimensionesMatriz,
  respuesta: string
): Promise<void> {
  await crearCelda(dimensiones, respuesta, "manual");
  revalidatePath("/admin/matriz");
}

export async function generarSugerenciasAction(): Promise<{ generadas: number }> {
  const generadas = await sugerirCeldasVacias();
  revalidatePath("/admin/matriz");
  return { generadas };
}
