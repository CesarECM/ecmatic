"use server";

import { revalidatePath } from "next/cache";
import { activarCampana, desactivarCampana } from "@/services/ghl-aprobacion";
import { logSistema } from "@/services/log-sistema";

const CAMPANA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

export async function toggleCampanaAction(activa: boolean): Promise<void> {
  if (activa) {
    await activarCampana(CAMPANA);
  } else {
    await desactivarCampana(CAMPANA);
  }
  void logSistema({
    categoria: "ui", tipoAccion: "ghl_campana.toggle", fase: "ok",
    resultado: activa ? "activada" : "desactivada",
  });
  revalidatePath("/admin/ghl-campaign");
}
