"use server";

import { revalidatePath } from "next/cache";
import { crearRecurso, aprobarRecurso, actualizarRecurso, procesarFuenteExterna } from "@/services/conocimiento";
import { createServiceClient } from "@/lib/supabase/service";
import type { TipoRecurso } from "@/lib/supabase/types";

export async function crearRecursoAction(formData: FormData) {
  const tipo = formData.get("tipo") as TipoRecurso;
  const titulo = formData.get("titulo") as string;
  const contenido = formData.get("contenido") as string;
  if (!tipo || !titulo?.trim() || !contenido?.trim()) return;

  const recurso = await crearRecurso(tipo, titulo.trim(), contenido.trim());
  await aprobarRecurso(recurso.id);
  revalidatePath("/admin/conocimiento");
}

export async function aprobarRecursoAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await aprobarRecurso(id);
  revalidatePath("/admin/conocimiento");
}

export async function setActivoAction(formData: FormData) {
  const id = formData.get("id") as string;
  const activo = formData.get("activo") === "true";
  if (!id) return;
  await actualizarRecurso(id, { activo });
  revalidatePath("/admin/conocimiento");
}

export async function editarRecursoAction(formData: FormData) {
  const id = formData.get("id") as string;
  const titulo = (formData.get("titulo") as string)?.trim();
  const contenido = (formData.get("contenido") as string)?.trim();
  if (!id || !titulo || !contenido) return;
  await actualizarRecurso(id, { titulo, contenido });
  revalidatePath("/admin/conocimiento");
}

export async function restaurarVersionAction(id: string, titulo: string, contenido: string) {
  await actualizarRecurso(id, { titulo, contenido });
  revalidatePath("/admin/conocimiento");
}

export async function eliminarRecursoAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").delete().eq("id", id);
  revalidatePath("/admin/conocimiento");
}

export async function importarFuenteAction(formData: FormData) {
  const fuente = (formData.get("fuente") as string)?.trim();
  if (!fuente) return;

  let contenido = fuente;
  if (fuente.startsWith("http://") || fuente.startsWith("https://")) {
    try {
      const res = await fetch(fuente, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      contenido = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    } catch {
      return;
    }
  }

  await procesarFuenteExterna(contenido);
  revalidatePath("/admin/conocimiento");
}
