"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { crearRecurso, aprobarRecurso } from "@/services/conocimiento";

export async function crearServicioAction(formData: FormData) {
  const titulo = (formData.get("titulo") as string)?.trim();
  const contenido = (formData.get("contenido") as string)?.trim();
  if (!titulo || !contenido) throw new Error("Faltan campos");
  const recurso = await crearRecurso("servicio", titulo, contenido, "interno");
  await aprobarRecurso(recurso.id);
  revalidatePath("/admin/servicios");
}

export async function actualizarPreciosAction(formData: FormData) {
  const id = formData.get("id") as string;
  const lista = formData.get("precio_lista") as string;
  const desc = formData.get("precio_descuento") as string;
  if (!id) throw new Error("ID requerido");

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("recursos_conocimiento")
    .update({
      precio_centavos: lista ? Math.round(parseFloat(lista) * 100) : null,
      precio_descuento_centavos: desc ? Math.round(parseFloat(desc) * 100) : null,
    })
    .eq("id", id);

  revalidatePath(`/admin/servicios/${id}`);
  revalidatePath("/admin/servicios");
}

export async function crearBundleReglaAction(formData: FormData) {
  const origenId = formData.get("origen_id") as string;
  const destinoId = formData.get("destino_id") as string;
  const tipo = formData.get("tipo") as string;
  if (!origenId || !destinoId || !tipo) throw new Error("Faltan campos");
  if (origenId === destinoId) throw new Error("Un servicio no puede relacionarse consigo mismo");

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("bundle_reglas")
    .upsert({ servicio_origen_id: origenId, servicio_destino_id: destinoId, tipo, activo: true },
      { onConflict: "servicio_origen_id,servicio_destino_id,tipo" });

  revalidatePath(`/admin/servicios/${origenId}`);
}

export async function eliminarBundleReglaAction(reglaId: string, origenId: string) {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("bundle_reglas").delete().eq("id", reglaId);
  revalidatePath(`/admin/servicios/${origenId}`);
}

export async function toggleImagenActivaAction(imagenId: string, activa: boolean, servicioId: string) {
  const { toggleImagenActiva } = await import("@/services/imagen-servicio");
  await toggleImagenActiva(imagenId, activa);
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarImagenAction(imagenId: string, storagePath: string, servicioId: string) {
  const { eliminarImagenServicio } = await import("@/services/imagen-servicio");
  await eliminarImagenServicio(imagenId, storagePath);
  revalidatePath(`/admin/servicios/${servicioId}`);
}
