"use server";

import { revalidatePath } from "next/cache";
import { aprobarCelda, crearCelda } from "@/services/matriz";
import { sugerirCeldasVacias } from "@/services/matriz-ia";
import type { DimensionesMatriz } from "@/lib/supabase/types";

export async function aprobarCeldaAction(id: string): Promise<void> {
  await aprobarCelda(id);
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
