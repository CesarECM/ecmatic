"use server";

import { revalidatePath } from "next/cache";
import { crearServicio, actualizarServicio, eliminarServicio } from "@/services/servicios";
import { crearServicioPago, actualizarServicioPago, eliminarServicioPago } from "@/services/servicio-pagos";
import {
  crearCuentaBancaria, actualizarCuentaBancaria, eliminarCuentaBancaria,
} from "@/services/cuentas-bancarias";
import { crearRelacion, eliminarRelacion } from "@/services/servicio-relaciones";
import { toggleImagenActiva, eliminarImagenServicio } from "@/services/imagen-servicio";
import type { TipoRelacion } from "@/services/servicio-relaciones";
import type { ModalidadServicio } from "@/services/servicios";
import { logSistema } from "@/services/log-sistema";
import { safeAction } from "@/lib/safe-action";

// ── Servicio CRUD ────────────────────────────────────────────

export const crearServicioAction = safeAction(async (formData: FormData) => {
  const titulo    = (formData.get("titulo")    as string)?.trim();
  const contenido = (formData.get("contenido") as string)?.trim();
  if (!titulo || !contenido) throw new Error("Título y descripción son requeridos");
  await crearServicio(titulo, contenido);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.crear", fase: "ok", resultado: titulo });
  revalidatePath("/admin/servicios");
});

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

  void logSistema({ categoria: "ui", tipoAccion: "servicios.actualizar-general", fase: "ok", metadata: { servicio_id: id } });
  revalidatePath(`/admin/servicios/${id}`);
  revalidatePath("/admin/servicios");
}

export async function actualizarPreciosAction(formData: FormData) {
  const id   = formData.get("id")               as string;
  const lista = formData.get("precio_lista")    as string;
  const desc  = formData.get("precio_descuento") as string;
  if (!id) throw new Error("ID requerido");

  await actualizarServicio(id, {
    precio_centavos:           lista ? Math.round(parseFloat(lista) * 100) : null,
    precio_descuento_centavos: desc  ? Math.round(parseFloat(desc)  * 100) : null,
  });

  void logSistema({ categoria: "ui", tipoAccion: "servicios.actualizar-precios", fase: "ok", metadata: { servicio_id: id } });
  revalidatePath(`/admin/servicios/${id}`);
  revalidatePath("/admin/servicios");
}

export async function actualizarApartadoAction(formData: FormData) {
  const id      = formData.get("id")             as string;
  const monto   = formData.get("precio_apartado") as string;
  if (!id) throw new Error("ID requerido");

  await actualizarServicio(id, {
    precio_apartado_centavos: monto ? Math.round(parseFloat(monto) * 100) : null,
  });

  void logSistema({ categoria: "ui", tipoAccion: "servicios.actualizar-apartado", fase: "ok", metadata: { servicio_id: id } });
  revalidatePath(`/admin/servicios/${id}`);
}

export async function eliminarServicioAction(id: string) {
  await eliminarServicio(id);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.eliminar", fase: "ok", metadata: { servicio_id: id } });
  revalidatePath("/admin/servicios");
}

export async function regenerarTodosEmbeddingsAction(): Promise<number> {
  void logSistema({ categoria: "ui", tipoAccion: "servicios.regenerar-embeddings", fase: "inicio" });
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

  void logSistema({ categoria: "ui", tipoAccion: "servicios.regenerar-embeddings", fase: "ok", resultado: `${actualizados} servicios actualizados`, metadata: { actualizados } });
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
  void logSistema({ categoria: "ui", tipoAccion: "servicios.regenerar-embedding", fase: "ok", metadata: { servicio_id: id } });
  revalidatePath(`/admin/servicios/${id}`);
}

// ── Links de pago ────────────────────────────────────────────

export async function crearPagoAction(formData: FormData) {
  const servicioId = formData.get("servicio_id") as string;
  const tipo       = formData.get("tipo") as "landing" | "pasarela" | "apartado";
  const url        = (formData.get("url")    as string)?.trim();
  const nombre     = (formData.get("nombre") as string)?.trim();
  if (!servicioId || !tipo || !url || !nombre) throw new Error("Faltan campos");
  await crearServicioPago({ servicio_id: servicioId, tipo, url, nombre });
  void logSistema({ categoria: "ui", tipoAccion: "servicios.crear-pago", fase: "ok", metadata: { servicio_id: servicioId, tipo } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarPagoAction(pagoId: string, servicioId: string) {
  await eliminarServicioPago(pagoId);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.eliminar-pago", fase: "ok", metadata: { pago_id: pagoId, servicio_id: servicioId } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function togglePagoActivoAction(pagoId: string, activo: boolean, servicioId: string) {
  await actualizarServicioPago(pagoId, { activo });
  void logSistema({ categoria: "ui", tipoAccion: "servicios.toggle-pago", fase: "ok", metadata: { pago_id: pagoId, servicio_id: servicioId, activo } });
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
  void logSistema({ categoria: "ui", tipoAccion: "servicios.crear-relacion", fase: "ok", metadata: { origen_id: origenId, destino_id: destinoId, tipo } });
  revalidatePath(`/admin/servicios/${origenId}`);
}

export async function eliminarRelacionAction(relacionId: string, servicioId: string) {
  await eliminarRelacion(relacionId);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.eliminar-relacion", fase: "ok", metadata: { relacion_id: relacionId, servicio_id: servicioId } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

// ── Imágenes ─────────────────────────────────────────────────

export async function toggleImagenActivaAction(imagenId: string, activa: boolean, servicioId: string) {
  await toggleImagenActiva(imagenId, activa);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.toggle-imagen", fase: "ok", metadata: { imagen_id: imagenId, servicio_id: servicioId, activa } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarImagenAction(imagenId: string, storagePath: string, servicioId: string) {
  await eliminarImagenServicio(imagenId, storagePath);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.eliminar-imagen", fase: "ok", metadata: { imagen_id: imagenId, servicio_id: servicioId } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

// ── Cuentas bancarias (globales) ─────────────────────────────

export async function crearCuentaAction(formData: FormData, servicioId: string) {
  const banco   = (formData.get("banco")   as string)?.trim();
  const titular = (formData.get("titular") as string)?.trim();
  const clabe   = (formData.get("clabe")   as string)?.trim() || null;
  const cuenta  = (formData.get("cuenta")  as string)?.trim() || null;
  const orden   = parseInt(formData.get("orden") as string ?? "0", 10) || 0;
  if (!banco || !titular) throw new Error("Banco y titular son requeridos");
  await crearCuentaBancaria({ banco, titular, clabe, cuenta, orden });
  void logSistema({ categoria: "ui", tipoAccion: "servicios.crear-cuenta-bancaria", fase: "ok" });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function eliminarCuentaAction(cuentaId: string, servicioId: string) {
  await eliminarCuentaBancaria(cuentaId);
  void logSistema({ categoria: "ui", tipoAccion: "servicios.eliminar-cuenta-bancaria", fase: "ok", metadata: { cuenta_id: cuentaId } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}

export async function toggleCuentaActivaAction(cuentaId: string, activa: boolean, servicioId: string) {
  await actualizarCuentaBancaria(cuentaId, { activa });
  void logSistema({ categoria: "ui", tipoAccion: "servicios.toggle-cuenta-bancaria", fase: "ok", metadata: { cuenta_id: cuentaId, activa } });
  revalidatePath(`/admin/servicios/${servicioId}`);
}
