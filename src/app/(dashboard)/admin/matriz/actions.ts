"use server";

import { revalidatePath } from "next/cache";
import { aprobarCelda, crearCelda } from "@/services/matriz";
import { sugerirCeldasVacias } from "@/services/matriz-ia";
import { createServiceClient } from "@/lib/supabase/service";
import type { DimensionesMatriz } from "@/lib/supabase/types";
import { logSistema } from "@/services/log-sistema";

export async function aprobarCeldaAction(id: string): Promise<void> {
  await aprobarCelda(id);
  void logSistema({ categoria: "ui", tipoAccion: "matriz.aprobar-celda", fase: "ok", metadata: { celda_id: id } });
  revalidatePath("/admin/matriz");
}

export async function actualizarCeldaAction(id: string, respuesta: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ respuesta_sugerida: respuesta }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "matriz.actualizar-celda", fase: "ok", metadata: { celda_id: id } });
  revalidatePath("/admin/matriz");
}

export async function rechazarCeldaAction(id: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").delete().eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "matriz.rechazar-celda", fase: "ok", metadata: { celda_id: id } });
  revalidatePath("/admin/matriz");
}

export async function crearCeldaManualAction(
  dimensiones: DimensionesMatriz,
  respuesta: string
): Promise<void> {
  await crearCelda(dimensiones, respuesta, "manual");
  void logSistema({ categoria: "ui", tipoAccion: "matriz.crear-celda", fase: "ok", metadata: { dimensiones } });
  revalidatePath("/admin/matriz");
}

export async function generarSugerenciasAction(): Promise<{ generadas: number }> {
  void logSistema({ categoria: "ui", tipoAccion: "matriz.generar-sugerencias", fase: "inicio" });
  const generadas = await sugerirCeldasVacias();
  void logSistema({ categoria: "ui", tipoAccion: "matriz.generar-sugerencias", fase: "ok", resultado: `${generadas} celdas generadas`, metadata: { generadas } });
  revalidatePath("/admin/matriz");
  return { generadas };
}
