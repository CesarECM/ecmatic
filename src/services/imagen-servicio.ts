// S32.8 — Gestión de imágenes por servicio: selección activa para el motor de respuesta
// y CRUD para el repositorio de media.

import { createServiceClient } from "@/lib/supabase/service";

export type CanalImagen = "whatsapp" | "email" | "landing";

export interface ImagenServicio {
  id: string;
  servicio_id: string;
  storage_path: string;
  url_publica: string;
  canal_uso: CanalImagen;
  etiqueta: string | null;
  score_conversion: number;
  veces_mostrada: number;
  veces_respondida: number;
  activa: boolean;
  created_at: string;
}

function buildPublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/imagenes-servicios/${path}`;
}

// Devuelve la URL pública de la imagen activa con mayor score para un servicio+canal.
// Usada por el motor de respuesta para incluir la URL en el contexto.
export async function seleccionarImagenActiva(
  servicioId: string,
  canal: CanalImagen
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data } = await supabase
    .from("imagenes_servicio")
    .select("storage_path")
    .eq("servicio_id", servicioId)
    .eq("canal_uso", canal)
    .eq("activa", true)
    .order("score_conversion", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return buildPublicUrl(data.storage_path);
}

export async function listarImagenesServicio(servicioId: string): Promise<ImagenServicio[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data } = await supabase
    .from("imagenes_servicio")
    .select("*")
    .eq("servicio_id", servicioId)
    .order("canal_uso")
    .order("score_conversion", { ascending: false });

  return ((data as ImagenServicio[]) ?? []).map((r) => ({
    ...r,
    url_publica: buildPublicUrl(r.storage_path),
  }));
}

export async function toggleImagenActiva(imagenId: string, activa: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  await supabase.from("imagenes_servicio").update({ activa }).eq("id", imagenId);
}

export async function actualizarScoreImagen(
  imagenId: string,
  veces_mostrada: number,
  veces_respondida: number
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const score_conversion = veces_mostrada > 0
    ? Math.round((veces_respondida / veces_mostrada) * 1000) / 1000
    : 0;
  await supabase
    .from("imagenes_servicio")
    .update({ veces_mostrada, veces_respondida, score_conversion })
    .eq("id", imagenId);
}

export async function eliminarImagenServicio(imagenId: string, storagePath: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.storage.from("imagenes-servicios").remove([storagePath]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("imagenes_servicio").delete().eq("id", imagenId);
}

export async function insertarImagenServicio(params: {
  servicioId: string;
  storagePath: string;
  canal: CanalImagen;
  etiqueta?: string;
}): Promise<ImagenServicio> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data, error } = await supabase
    .from("imagenes_servicio")
    .insert({
      servicio_id: params.servicioId,
      storage_path: params.storagePath,
      canal_uso: params.canal,
      etiqueta: params.etiqueta ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Error al insertar imagen: ${error?.message}`);
  return { ...(data as ImagenServicio), url_publica: buildPublicUrl(data.storage_path) };
}
