"use server";

import { revalidatePath } from "next/cache";
import { crearExperimento, declararGanador } from "@/services/experimentos";

export async function crearExperimentoAction(formData: FormData): Promise<void> {
  await crearExperimento({
    nombre: formData.get("nombre") as string,
    descripcion: (formData.get("descripcion") as string) || undefined,
    precioACentavos: Math.round(Number(formData.get("precio_a")) * 100),
    precioBCentavos: Math.round(Number(formData.get("precio_b")) * 100),
    segmentoA: (formData.get("segmento_a") as string) || "todos",
    segmentoB: (formData.get("segmento_b") as string) || "todos",
  });
  revalidatePath("/admin/analitica");
}

export async function declararGanadorAction(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  await declararGanador(experimentoId, ganador);
  revalidatePath("/admin/analitica");
}
