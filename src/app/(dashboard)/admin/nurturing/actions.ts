"use server";

import { revalidatePath } from "next/cache";
import { actualizarSecuencia } from "@/services/nurturing";
import { ejecutarCicloReengagement } from "@/services/reengagement";

export async function toggleSecuenciaAction(id: string, activo: boolean) {
  await actualizarSecuencia(id, { activo });
  revalidatePath("/admin/nurturing");
}

export async function dispararCicloAction(): Promise<{
  procesados: number;
  enviados: number;
  omitidos: number;
}> {
  const resultado = await ejecutarCicloReengagement();
  revalidatePath("/admin/nurturing");
  return resultado;
}
