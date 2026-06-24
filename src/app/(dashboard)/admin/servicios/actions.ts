"use server";

import { revalidatePath } from "next/cache";
import { crearServicio, actualizarServicio, eliminarServicio } from "@/services/servicios";
import { crearServicioPago, actualizarServicioPago, eliminarServicioPago } from "@/services/servicio-pagos";
import { crearRelacion, eliminarRelacion } from "@/services/servicio-relaciones";
import { toggleImagenActiva, eliminarImagenServicio } from "@/services/imagen-servicio";
import type { TipoRelacion } from "@/services/servicio-relaciones";
import type { ModalidadServicio } from "@/services/servicios";

// ── Servicio CRUD ────────────────────────────────────────────

export async function crearServicioAction(formData: FormData) {
  const titulo   = (formData.get("titulo")   as string)?.trim();
  const contenido = (formData.get("contenido") as string)?.trim();
  if (!titulo || !contenido) throw new Error("Título y descripción son requeridos");
  await crearServicio(titulo, contenido);
  revalidatePath("/admin/servicios");
}

export async function actualizarDatosGeneralesAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) throw new Error("ID requerido");

  const bool = (k: string) => { const v = formData.get(k); return v !== null ? v === "true" : undefined; };
  const num  = (k: string) => { const v = formData.get(k) as string; return v?.trim() ? Number(v) : null; };
  const arr  = (k: string): string[] | null => {
    const v = (formData.get(k) as string)?.trim();
    return v ? v.split(",").map(s => s.trim()).filter(Boolean) : null;
  };

  await actualizarServicio(id, {
    titulo:                      (formData.get("titulo")    as string)?.trim() || undefined,
    contenido:                   (formData.get("contenido") as string)?.trim() || undefined,
    activo:                      bool("activo"),
    estandar_conocer:            (formData.get("estandar_conocer") as string)?.trim() || null,
    nivel_estandar:              num("nivel_estandar") as number | null,
    conocer_habilitado:          bool("conocer_habilitado"),
    caracteristicas:             (formData.get("caracteristicas") as string)?.trim() || null,
    beneficios:                  (formData.get("beneficios")      as string)?.trim() || null,
    ventajas:                    (formData.get("ventajas")        as string)?.trim() || null,
    para_quien_es:               (formData.get("para_quien_es")   as string)?.trim() || null,
    para_quien_no_es:            (formData.get("para_quien_no_es") as string)?.trim() || null,
    modo_venta:                  (formData.get("modo_venta") as "directo" | "meet") || "meet",
    modalidad:                   (formData.get("modalidad") as ModalidadServicio) || null,
    duracion_horas:              num("duracion_horas") as number | null,
    requisitos_previos:          (formData.get("requisitos_previos") as string)?.trim() || null,
    entregables:                 arr("entregables"),
    garantia:                    (formData.get("garantia")        as string)?.trim() || null,
    tiempo_promedio_cierre_dias: num("tiempo_promedio_cierre_dias") as number | null,
    sector_industria:            arr("sector_industria"),
    ocupacion_objetivo:          (formData.get("ocupacion_objetivo") as string)?.trim() || null,
    orden_catalogo:              num("orden_catalogo") as number | null,
    color_marca:                 (formData.get("color_marca")     as string)?.trim() || null,
    icono:                       (formData.get("icono")           as string)?.trim() || null,
    slug:                        (formData.get("slug")            as string)?.trim() || null,
    url_landing_propia:          (formData.get("url_landing_propia") as string)?.trim() || null,
    meta_title:                  (formData.get("meta_title")      as string)?.trim() || null,
    meta_descripcion:            (formData.get("meta_descripcion") as string)?.trim() || null,
  });

  revalidatePath(`/admin/servicios/${id}`);
  revalidatePath("/admin/servicios");
}

export async function actualizarPreciosAction(formData: FormData) {
  const id    = formData.get("id")    as string;
  const lista = formData.get("precio_lista")     as string;
  const desc  = formData.get("precio_descuento") as string;
  if (!id) throw new Error("ID requerido");

  const apartado = formData.get("precio_apartado") as string;
  await actualizarServicio(id, {
    precio_centavos:           lista    ? Math.round(parseFloat(lista)    * 100) : null,
    precio_descuento_centavos: desc     ? Math.round(parseFloat(desc)     * 100) : null,
    precio_apartado_centavos:  apartado ? Math.round(parseFloat(apartado) * 100) : null,
  });

  revalidatePath(`/admin/servicios/${id}`);
  revalidatePath("/admin/servicios");
}

export async function eliminarServicioAction(id: string) {
  await eliminarServicio(id);
  revalidatePath("/admin/servicios");
}

export async function regenerarTodosEmbeddingsAction(): Promise<number> {
  const { generarEmbedding } = await import("@/lib/ai/client");
  const { createServiceClient } = await import("@/lib/supabase/service");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, titulo, contenido, caracteristicas, beneficios, ventajas")
    .eq("activo", true);

  let actualizados = 0;
  for (const s of servicios ?? []) {
    const texto = [s.titulo, s.contenido, s.caracteristicas, s.beneficios, s.ventajas]
      .filter(Boolean).join("\n");
    const embedding = await generarEmbedding(texto);
    await supabase.from("servicios").update({ embedding }).eq("id", s.id);
    actualizados++;
  }

  revalidatePath("/admin/servicios");
  return actualizados;
}

export async function regenerarEmbeddingAction(id: string) {
  const { obtenerServicio } = await import("@/services/servicios");
  const { generarEmbedding } = await import("@/lib/ai/client");
  const { createServiceClient } = await import("@/lib/supabase/service");

  const s = await obtenerServicio(id);
  const textoEmbed = [s.titulo, s.contenido, s.caracteristicas, s.beneficios, s.ventajas]
    .filter(Boolean).join("\n");
  const embedding = await generarEmbedding(textoEmbed);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createServiceClient() as any).from("servicios").update({ embedding }).eq("id", id);
  revalidatePath(`/admin/servicios/${id}`);
}

// ── Links de pago ────────────────────────────────────────────

export async function crearPagoAction(formData: FormData) {
  const servicioId  = formData.get("servicio_id") as string;
  const tipo        = formData.get("tipo") as "landing" | "pasarela";
  const url         = (formData.get("url") as string)?.trim();
  const descripcion = (formData.get("descripcion") as string)?.trim() || null;
  if (!servicioId || !tipo || !url) throw new Error("Faltan campos");
  await crearServicioPago({ servicio_id: servicioId, tipo, url, descripcion });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarPagoAction(pagoId: string, servicioId: string) {
  await eliminarServicioPago(pagoId);
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function togglePagoActivoAction(pagoId: string, activo: boolean, servicioId: string) {
  await actualizarServicioPago(pagoId, { activo });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

// ── Relaciones ───────────────────────────────────────────────

export async function crearRelacionAction(formData: FormData) {
  const origenId  = formData.get("origen_id")  as string;
  const destinoId = formData.get("destino_id") as string;
  const tipo      = formData.get("tipo")        as TipoRelacion;
  const descripcion = (formData.get("descripcion") as string)?.trim() || undefined;
  if (!origenId || !destinoId || !tipo) throw new Error("Faltan campos");
  await crearRelacion({ origenId, destinoId, tipo, descripcion });
  revalidatePath(`/admin/servicios/${origenId}`);
}

export async function eliminarRelacionAction(relacionId: string, servicioId: string) {
  await eliminarRelacion(relacionId);
  revalidatePath(`/admin/servicios/${servicioId}`);
}

// ── Imágenes ─────────────────────────────────────────────────

export async function toggleImagenActivaAction(imagenId: string, activa: boolean, servicioId: string) {
  await toggleImagenActiva(imagenId, activa);
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarImagenAction(imagenId: string, storagePath: string, servicioId: string) {
  await eliminarImagenServicio(imagenId, storagePath);
  revalidatePath(`/admin/servicios/${servicioId}`);
}
