"use server";

import { revalidatePath } from "next/cache";
import { crearExperimento, declararGanador } from "@/services/experimentos";
import { logSistema } from "@/services/log-sistema";

export async function crearExperimentoAction(formData: FormData): Promise<void> {
  const nombre = formData.get("nombre") as string;
  await crearExperimento({
    nombre,
    descripcion: (formData.get("descripcion") as string) || undefined,
    precioACentavos: Math.round(Number(formData.get("precio_a")) * 100),
    precioBCentavos: Math.round(Number(formData.get("precio_b")) * 100),
    segmentoA: (formData.get("segmento_a") as string) || "todos",
    segmentoB: (formData.get("segmento_b") as string) || "todos",
  });
  void logSistema({ categoria: "ui", tipoAccion: "analitica.crear-experimento", fase: "ok", resultado: nombre });
  revalidatePath("/admin/analitica");
}

export async function declararGanadorAction(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  await declararGanador(experimentoId, ganador);
  void logSistema({ categoria: "ui", tipoAccion: "analitica.declarar-ganador", fase: "ok", metadata: { experimento_id: experimentoId, ganador } });
  revalidatePath("/admin/analitica");
}
