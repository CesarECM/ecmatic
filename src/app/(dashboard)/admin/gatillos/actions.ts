"use server";

import { revalidatePath } from "next/cache";
import { toggleGatillo, actualizarGatillo, crearGatillo, sugerirGatillos } from "@/services/gatillos";
import type { TipoGatillo, AudienciaGatillo } from "@/lib/supabase/types";

export async function toggleGatilloAction(id: string, activo: boolean): Promise<void> {
  await toggleGatillo(id, activo);
  revalidatePath("/admin/gatillos");
}

export async function actualizarGatilloAction(
  id: string,
  datos: { valor_actual?: string; fecha_expiracion?: string | null; audiencia_objetivo?: AudienciaGatillo }
): Promise<void> {
  await actualizarGatillo(id, datos);
  revalidatePath("/admin/gatillos");
}

export async function crearGatilloAction(formData: FormData): Promise<void> {
  await crearGatillo({
    tipo: formData.get("tipo") as TipoGatillo,
    nombre: formData.get("nombre") as string,
    valor_actual: formData.get("valor_actual") as string,
    audiencia_objetivo: (formData.get("audiencia_objetivo") as AudienciaGatillo) ?? "all",
    fecha_expiracion: (formData.get("fecha_expiracion") as string) || null,
  });
  revalidatePath("/admin/gatillos");
}

export async function sugerirGatillosAction(): Promise<{ tipo: TipoGatillo; razon: string }[]> {
  return sugerirGatillos();
}
