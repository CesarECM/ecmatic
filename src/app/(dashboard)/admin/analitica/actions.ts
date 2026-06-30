"use server";

import { revalidatePath } from "next/cache";
import { crearExperimento, declararGanador } from "@/services/experimentos";
import { crearExperimentoPrompt, declararGanadorPrompt } from "@/services/prompt-experimentos";
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

export async function crearExperimentoPromptAction(formData: FormData): Promise<void> {
  const nombre     = formData.get("nombre") as string;
  const varianteA  = formData.get("variante_a") as string;
  const varianteB  = formData.get("variante_b") as string;
  const stage      = (formData.get("pipeline_stage") as string) || undefined;
  const temp       = (formData.get("temperamento") as string) || undefined;
  const segmento   = stage || temp ? { ...(stage && { pipeline_stage: stage }), ...(temp && { temperamento: temp }) } : undefined;
  await crearExperimentoPrompt({ nombre, varianteA, varianteB, segmento });
  void logSistema({ categoria: "ui", tipoAccion: "analitica.crear-exp-prompt", fase: "ok", resultado: nombre });
  revalidatePath("/admin/analitica");
}

export async function declararGanadorPromptAction(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  await declararGanadorPrompt(experimentoId, ganador);
  void logSistema({ categoria: "ui", tipoAccion: "analitica.declarar-ganador-prompt", fase: "ok", metadata: { experimento_id: experimentoId, ganador } });
  revalidatePath("/admin/analitica");
}
