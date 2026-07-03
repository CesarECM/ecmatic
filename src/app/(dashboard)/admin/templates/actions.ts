"use server";

import { revalidatePath } from "next/cache";
import { logSistema } from "@/services/log-sistema";
import { promoverTemplate, conectarWorkflow } from "@/services/followup-templates";
import { createServiceClient } from "@/lib/supabase/service";

export async function promoverTemplateAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  const nuevoTexto = (formData.get("texto") as string)?.trim();
  if (!templateId) return;
  await promoverTemplate(templateId, nuevoTexto || undefined);
  void logSistema({ categoria: "ui", tipoAccion: "templates.promover", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}

export async function conectarWorkflowAction(formData: FormData) {
  const templateId    = formData.get("templateId") as string;
  const workflowId    = (formData.get("workflowId") as string)?.trim();
  if (!templateId || !workflowId) return;
  await conectarWorkflow(templateId, workflowId);
  void logSistema({ categoria: "ui", tipoAccion: "templates.conectar_workflow", fase: "ok", resultado: `${templateId} → ${workflowId}` });
  revalidatePath("/admin/templates");
}

export async function desconectarWorkflowAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  if (!templateId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  await supabase
    .from("followup_templates")
    .update({ estado: "aprobado", ghl_workflow_id: null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  void logSistema({ categoria: "ui", tipoAccion: "templates.desconectar", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}

export async function eliminarTemplateSugeridoAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  if (!templateId) return;
  // Solo permite eliminar sugeridos — los aprobados/conectados requieren degradación manual
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  await supabase.from("followup_templates").delete().eq("id", templateId).eq("estado", "sugerido");
  void logSistema({ categoria: "ui", tipoAccion: "templates.eliminar", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}
