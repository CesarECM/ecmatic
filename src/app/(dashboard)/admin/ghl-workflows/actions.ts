"use server";

import { revalidatePath } from "next/cache";
import { actualizarWorkflow } from "@/services/ghl-workflows";
import { sincronizarWorkflows } from "@/services/ghl-workflows";
import { logSistema } from "@/services/log-sistema";

export async function clasificarWorkflowAction(
  id: string,
  clasificacion: "keep" | "rescue" | "delete"
) {
  await actualizarWorkflow(id, { clasificacion });
  void logSistema({
    categoria: "ui", tipoAccion: "ghl.clasificar_workflow", fase: "ok",
    metadata: { workflow_id: id, clasificacion },
  });
  revalidatePath("/admin/ghl-workflows");
}

export async function guardarNotasAction(id: string, notas: string) {
  await actualizarWorkflow(id, { notas: notas.trim() || undefined });
  revalidatePath("/admin/ghl-workflows");
}

export async function sincronizarAction() {
  const resultado = await sincronizarWorkflows();
  void logSistema({
    categoria: "ui", tipoAccion: "ghl.sync_workflows", fase: "ok",
    resultado: `${resultado.insertados} nuevos · ${resultado.actualizados} actualizados`,
    metadata: resultado,
  });
  revalidatePath("/admin/ghl-workflows");
  return resultado;
}
