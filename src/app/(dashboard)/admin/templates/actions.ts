"use server";

import { revalidatePath } from "next/cache";
import { logSistema } from "@/services/log-sistema";
import { promoverTemplate, conectarWorkflow } from "@/services/followup-templates";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

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
  await db()
    .from("followup_templates")
    .update({ estado: "aprobado", ghl_workflow_id: null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  void logSistema({ categoria: "ui", tipoAccion: "templates.desconectar", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}

export async function eliminarTemplateSugeridoAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  if (!templateId) return;
  await db().from("followup_templates").delete().eq("id", templateId).eq("estado", "sugerido");
  void logSistema({ categoria: "ui", tipoAccion: "templates.eliminar", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}

export async function eliminarTemplateAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  if (!templateId) return;
  await db().from("followup_templates").delete().eq("id", templateId);
  void logSistema({ categoria: "ui", tipoAccion: "templates.eliminar_forzado", fase: "ok", resultado: templateId });
  revalidatePath("/admin/templates");
}

export async function degradarEstadoAction(formData: FormData) {
  const templateId = formData.get("templateId") as string;
  const estadoActual = formData.get("estadoActual") as string;
  if (!templateId || !estadoActual) return;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (estadoActual === "conectado") {
    updates.estado          = "aprobado";
    updates.ghl_workflow_id = null;
  } else if (estadoActual === "aprobado") {
    updates.estado = "sugerido";
  } else {
    return;
  }

  await db().from("followup_templates").update(updates).eq("id", templateId);
  void logSistema({
    categoria: "ui", tipoAccion: "templates.degradar", fase: "ok",
    resultado: `${templateId} ${estadoActual} → ${updates.estado}`,
  });
  revalidatePath("/admin/templates");
}

export async function crearTemplateAction(formData: FormData) {
  const tipo   = formData.get("tipo")  as string;
  const texto  = (formData.get("texto") as string)?.trim();
  const estado = (formData.get("estado") as string) ?? "aprobado";
  if (!tipo || !texto || texto.length < 20) return;
  if (!["nurturing", "conversational", "payment", "demo_agendado"].includes(tipo)) return;
  if (!["sugerido", "aprobado"].includes(estado)) return;

  const { error } = await db()
    .from("followup_templates")
    .insert({ tipo, texto, estado });

  if (!error) {
    void logSistema({
      categoria: "ui", tipoAccion: "templates.crear_manual", fase: "ok",
      resultado: `tipo:${tipo} estado:${estado}`,
    });
  }
  revalidatePath("/admin/templates");
}
