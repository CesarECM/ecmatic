"use server";

import { revalidatePath } from "next/cache";
import { logSistema } from "@/services/log-sistema";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function cancelarSeguimientoAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await db()
    .from("seguimiento_lead")
    .update({ estado: "cancelado" })
    .eq("id", id)
    .eq("estado", "activo");
  void logSistema({
    categoria: "ui", tipoAccion: "seguimiento.cancelar_manual", fase: "ok",
    resultado: id,
  });
  revalidatePath("/admin/seguimientos");
}

export async function reprogramarSeguimientoAction(formData: FormData) {
  const id    = formData.get("id")    as string;
  const horas = parseInt(formData.get("horas") as string ?? "4", 10);
  if (!id || isNaN(horas) || horas < 1 || horas > 168) return;
  const nuevoAt = new Date(Date.now() + horas * 3_600_000).toISOString();
  await db()
    .from("seguimiento_lead")
    .update({ proximo_at: nuevoAt })
    .eq("id", id)
    .eq("estado", "activo");
  void logSistema({
    categoria: "ui", tipoAccion: "seguimiento.reprogramar_manual", fase: "ok",
    resultado: `${id} +${horas}h → ${nuevoAt}`,
  });
  revalidatePath("/admin/seguimientos");
}
