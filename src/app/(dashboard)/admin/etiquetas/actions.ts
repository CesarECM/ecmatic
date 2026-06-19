"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  aprobarEtiqueta,
  archivarEtiqueta,
  crearEtiqueta,
  fusionarEtiquetas,
} from "@/services/etiquetas";

export async function aprobarEtiquetaAction(id: string) {
  await aprobarEtiqueta(id);
  revalidatePath("/admin/etiquetas");
  revalidatePath("/admin/aprobaciones");
}

export async function archivarEtiquetaAction(id: string) {
  await archivarEtiqueta(id);
  revalidatePath("/admin/etiquetas");
  revalidatePath("/admin/aprobaciones");
}

export async function crearEtiquetaAction(formData: FormData) {
  const categoriaId = formData.get("categoriaId") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || undefined;
  if (!categoriaId || !nombre) return;
  await crearEtiqueta(categoriaId, nombre, descripcion, "manual");
  revalidatePath("/admin/etiquetas");
}

export async function fusionarEtiquetasAction(formData: FormData) {
  const idOrigen = formData.get("idOrigen") as string;
  const idDestino = formData.get("idDestino") as string;
  if (!idOrigen || !idDestino || idOrigen === idDestino) return;
  await fusionarEtiquetas(idOrigen, idDestino);
  revalidatePath("/admin/etiquetas");
}

export async function crearCategoriaAction(formData: FormData) {
  const nombre = (formData.get("nombre") as string).trim();
  const color = (formData.get("color") as string) || "#6B7280";
  if (!nombre) return;
  const supabase = createServiceClient();
  await supabase.from("etiqueta_categorias").insert({ nombre, color });
  revalidatePath("/admin/etiquetas");
}
