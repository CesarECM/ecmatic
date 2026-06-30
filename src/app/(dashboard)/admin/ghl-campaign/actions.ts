"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { activarCampana, desactivarCampana, reiniciarNivelesCampana } from "@/services/ghl-aprobacion";
import { logSistema } from "@/services/log-sistema";
import { reclasificarCobertura } from "@/services/reclasificar-cobertura";

const CAMPANA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

// Elimina el registro de campaña y el lead pre-creado en ECMatic para ese contacto GHL.
// Las estadísticas se recalculan automáticamente en el siguiente render.
export async function eliminarLogCampanaAction(ghlContactId: string): Promise<void> {
  const supabase = createServiceClient() as any;
  await Promise.all([
    supabase.from("ghl_campana_logs").delete().eq("ghl_contact_id", ghlContactId).eq("campana", CAMPANA),
    supabase.from("leads").delete().eq("telefono", `ghl_${ghlContactId}`),
  ]);
  void logSistema({
    categoria: "ui", tipoAccion: "ghl_campana.eliminar_log", fase: "ok",
    resultado: ghlContactId,
  });
  revalidatePath("/admin/ghl-campaign");
}

export async function reiniciarNivelesAction(): Promise<void> {
  await reiniciarNivelesCampana(CAMPANA);
  void logSistema({
    categoria: "ui", tipoAccion: "ghl_campana.reiniciar_niveles", fase: "ok",
    resultado: CAMPANA,
  });
  revalidatePath("/admin/ghl-campaign");
}

export async function auditarCoberturaAction(): Promise<{ creados: number; procesados: number }> {
  const resultado = await reclasificarCobertura(200);
  void logSistema({
    categoria: "ui", tipoAccion: "ghl_campana.auditar_cobertura", fase: "ok",
    resultado: `procesados:${resultado.procesados} creados:${resultado.creados}`,
    metadata:  resultado as unknown as Record<string, unknown>,
  });
  revalidatePath("/admin/ghl-campaign");
  return { creados: resultado.creados, procesados: resultado.procesados };
}

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
