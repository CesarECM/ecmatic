"use server";

import { revalidatePath } from "next/cache";
import { toggleGatillo, actualizarGatillo, crearGatillo, sugerirGatillos } from "@/services/gatillos";
import type { TipoGatillo, AudienciaGatillo } from "@/lib/supabase/types";
import { logSistema } from "@/services/log-sistema";
import { safeAction } from "@/lib/safe-action";

export async function toggleGatilloAction(id: string, activo: boolean): Promise<void> {
  await toggleGatillo(id, activo);
  void logSistema({ categoria: "ui", tipoAccion: "gatillos.toggle", fase: "ok", metadata: { gatillo_id: id, activo } });
  revalidatePath("/admin/gatillos");
}

export async function actualizarGatilloAction(
  id: string,
  datos: { valor_actual?: string; fecha_expiracion?: string | null; audiencia_objetivo?: AudienciaGatillo }
): Promise<void> {
  await actualizarGatillo(id, datos);
  void logSistema({ categoria: "ui", tipoAccion: "gatillos.actualizar", fase: "ok", metadata: { gatillo_id: id, ...datos } });
  revalidatePath("/admin/gatillos");
}

export async function crearGatilloAction(formData: FormData): Promise<void> {
  const tipo = formData.get("tipo") as TipoGatillo;
  const nombre = formData.get("nombre") as string;
  await crearGatillo({
    tipo,
    nombre,
    valor_actual: formData.get("valor_actual") as string,
    audiencia_objetivo: (formData.get("audiencia_objetivo") as AudienciaGatillo) ?? "all",
    fecha_expiracion: (formData.get("fecha_expiracion") as string) || null,
  });
  void logSistema({ categoria: "ui", tipoAccion: "gatillos.crear", fase: "ok", resultado: nombre, metadata: { tipo } });
  revalidatePath("/admin/gatillos");
}

export const sugerirGatillosAction = safeAction(async (): Promise<{ tipo: TipoGatillo; razon: string }[]> => {
  void logSistema({ categoria: "ui", tipoAccion: "gatillos.sugerir", fase: "ok" });
  return sugerirGatillos();
});
