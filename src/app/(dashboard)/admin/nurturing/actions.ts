"use server";

import { revalidatePath } from "next/cache";
import { actualizarSecuencia } from "@/services/nurturing";
import { ejecutarCicloReengagement } from "@/services/reengagement";
import { logSistema } from "@/services/log-sistema";

export async function toggleSecuenciaAction(id: string, activo: boolean) {
  await actualizarSecuencia(id, { activo });
  void logSistema({ categoria: "ui", tipoAccion: "nurturing.toggle-secuencia", fase: "ok", metadata: { secuencia_id: id, activo } });
  revalidatePath("/admin/nurturing");
}

export async function dispararCicloAction(): Promise<{
  procesados: number;
  enviados: number;
  omitidos: number;
}> {
  void logSistema({ categoria: "ui", tipoAccion: "nurturing.disparar-ciclo", fase: "inicio" });
  try {
    const resultado = await ejecutarCicloReengagement();
    void logSistema({ categoria: "ui", tipoAccion: "nurturing.disparar-ciclo", fase: "ok", resultado: `${resultado.enviados} enviados`, metadata: resultado });
    revalidatePath("/admin/nurturing");
    return resultado;
  } catch (err) {
    void logSistema({ categoria: "ui", tipoAccion: "nurturing.disparar-ciclo", fase: "error", resultado: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
