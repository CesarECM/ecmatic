"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function crearReglaAction(formData: FormData) {
  const nombre      = (formData.get("nombre") as string)?.trim();
  const tipo        = formData.get("tipo") as string;
  const instruccion = (formData.get("instruccion") as string)?.trim();
  const descripcion = (formData.get("descripcion") as string)?.trim() || null;
  const prioridad   = Number(formData.get("prioridad") ?? 50);

  if (!nombre || !tipo || !instruccion) return;

  const condicionesRaw = (formData.get("condiciones") as string)?.trim();
  let condiciones: Record<string, unknown> = {};
  try {
    if (condicionesRaw) condiciones = JSON.parse(condicionesRaw);
  } catch { /* dejar vacío si JSON inválido */ }

  const { error } = await db()
    .from("reglas_conversacionales")
    .insert({ nombre, tipo, instruccion, descripcion, prioridad, condiciones, origen: "manual" });

  if (error) {
    void logSistema({ categoria: "ui", tipoAccion: "reglas.crear", fase: "error", resultado: error.message });
    return;
  }

  void logSistema({ categoria: "ui", tipoAccion: "reglas.crear", fase: "ok", resultado: nombre });
  revalidatePath("/admin/reglas");
}

export async function aprobarReglaAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  await db()
    .from("reglas_conversacionales")
    .update({ aprobada: true, aprobada_at: new Date().toISOString() })
    .eq("id", id);

  void logSistema({ categoria: "ui", tipoAccion: "reglas.aprobar", fase: "ok", metadata: { id } });
  revalidatePath("/admin/reglas");
}

export async function desactivarReglaAction(formData: FormData) {
  const id     = formData.get("id") as string;
  const activa = formData.get("activa") === "true";
  if (!id) return;

  await db()
    .from("reglas_conversacionales")
    .update({ activa: !activa })
    .eq("id", id);

  void logSistema({ categoria: "ui", tipoAccion: "reglas.toggle_activa", fase: "ok", metadata: { id, activa: !activa } });
  revalidatePath("/admin/reglas");
}

export async function editarReglaAction(formData: FormData) {
  const id          = formData.get("id") as string;
  const instruccion = (formData.get("instruccion") as string)?.trim();
  const prioridad   = Number(formData.get("prioridad") ?? 50);
  const descripcion = (formData.get("descripcion") as string)?.trim() || null;
  if (!id || !instruccion) return;

  const condicionesRaw = (formData.get("condiciones") as string)?.trim();
  let condiciones: Record<string, unknown> = {};
  try {
    if (condicionesRaw) condiciones = JSON.parse(condicionesRaw);
  } catch { /* dejar sin cambiar condiciones */ }

  await db()
    .from("reglas_conversacionales")
    .update({ instruccion, prioridad, descripcion, ...(condicionesRaw && { condiciones }) })
    .eq("id", id);

  void logSistema({ categoria: "ui", tipoAccion: "reglas.editar", fase: "ok", metadata: { id } });
  revalidatePath("/admin/reglas");
}
