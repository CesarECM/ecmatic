// Gestión completa de servicios como entidad independiente (Sprint 36).
// Los servicios ya no viven en recursos_conocimiento — tienen su propia tabla.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";

export type ModalidadServicio = "presencial" | "en_linea" | "hibrido";

export interface Servicio {
  id: string;
  titulo: string;
  contenido: string;
  activo: boolean;
  aprobado: boolean;
  origen: string;
  score_uso: number;
  score_cierre: number;
  score_confianza: number;
  versiones_previas: { titulo: string; contenido: string; fecha: string }[];
  // Ficha enriquecida
  caracteristicas: string | null;
  beneficios: string | null;
  ventajas: string | null;
  para_quien_es: string | null;
  para_quien_no_es: string | null;
  // Precios
  precio_centavos: number | null;
  precio_descuento_centavos: number | null;
  // CONOCER
  estandar_conocer: string | null;
  nivel_estandar: number | null;
  conocer_habilitado: boolean;
  // Venta
  modalidad: ModalidadServicio | null;
  duracion_horas: number | null;
  requisitos_previos: string | null;
  entregables: string[] | null;
  garantia: string | null;
  tiempo_promedio_cierre_dias: number | null;
  // Público objetivo
  sector_industria: string[] | null;
  ocupacion_objetivo: string | null;
  // Catálogo y branding
  orden_catalogo: number | null;
  color_marca: string | null;
  icono: string | null;
  slug: string | null;
  url_landing_propia: string | null;
  // SEO
  meta_title: string | null;
  meta_descripcion: string | null;
  created_at: string;
  updated_at: string;
}

export type ActualizarServicioInput = Partial<Omit<Servicio,
  "id" | "score_uso" | "score_cierre" | "score_confianza" |
  "versiones_previas" | "origen" | "created_at" | "updated_at"
>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function listarServicios(soloActivos = false): Promise<Servicio[]> {
  let q = db()
    .from("servicios")
    .select("*")
    .order("orden_catalogo", { ascending: true, nullsFirst: false })
    .order("score_uso", { ascending: false });
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw new Error(`[servicios] listar: ${error.message}`);
  return (data ?? []) as Servicio[];
}

export async function obtenerServicio(id: string): Promise<Servicio> {
  const { data, error } = await db().from("servicios").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`[servicios] no encontrado: ${id}`);
  return data as Servicio;
}

export async function crearServicio(
  titulo: string,
  contenido: string,
  extra: Partial<ActualizarServicioInput> = {}
): Promise<Servicio> {
  const embedding = await generarEmbedding(`${titulo}\n${contenido}`);
  const { data, error } = await db()
    .from("servicios")
    .insert({ titulo, contenido, embedding, ...extra })
    .select()
    .single();
  if (error || !data) throw new Error(`[servicios] crear: ${error?.message}`);

  // Sugerencias iniciales (fire-and-forget)
  void import("@/lib/ai/paquete-servicio-nuevo")
    .then(m => m.generarPaqueteServicioNuevo(data.id, titulo, contenido))
    .catch(console.error);

  // Auditor IA (fire-and-forget)
  void import("@/services/auditor-servicios")
    .then(m => m.dispararAuditoria(data.id, "crear"))
    .catch(console.error);

  return data as Servicio;
}

export async function actualizarServicio(
  id: string,
  campos: ActualizarServicioInput
): Promise<Servicio> {
  const cambiaTitulo = campos.titulo !== undefined || campos.contenido !== undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { ...campos };

  if (cambiaTitulo) {
    const { data: actual } = await db()
      .from("servicios")
      .select("titulo, contenido, versiones_previas")
      .eq("id", id)
      .single();

    if (actual) {
      update.versiones_previas = [
        ...(actual.versiones_previas ?? []),
        { titulo: actual.titulo, contenido: actual.contenido, fecha: new Date().toISOString() },
      ];
      update.embedding = await generarEmbedding(
        `${campos.titulo ?? actual.titulo}\n${campos.contenido ?? actual.contenido}`
      );
    }
  }

  const { data, error } = await db().from("servicios").update(update).eq("id", id).select().single();
  if (error || !data) throw new Error(`[servicios] actualizar: ${error?.message}`);

  // Auditor IA (fire-and-forget)
  void import("@/services/auditor-servicios")
    .then(m => m.dispararAuditoria(id, "editar"))
    .catch(console.error);

  return data as Servicio;
}

export async function eliminarServicio(id: string): Promise<void> {
  const { error } = await db().from("servicios").delete().eq("id", id);
  if (error) throw new Error(`[servicios] eliminar: ${error.message}`);
}

export async function registrarUsoServicio(ids: string[]): Promise<void> {
  if (!ids.length) return;
  for (const id of ids) {
    const { data } = await db().from("servicios").select("score_uso, score_cierre").eq("id", id).single();
    if (!data) continue;
    const score_uso = data.score_uso + 1;
    const score_confianza = calcularScore(score_uso, data.score_cierre);
    await db().from("servicios").update({ score_uso, score_confianza }).eq("id", id);
  }
}

export async function registrarCierreServicio(ids: string[]): Promise<void> {
  if (!ids.length) return;
  for (const id of ids) {
    const { data } = await db().from("servicios").select("score_uso, score_cierre").eq("id", id).single();
    if (!data) continue;
    const score_cierre = data.score_cierre + 1;
    const score_confianza = calcularScore(data.score_uso, score_cierre);
    await db().from("servicios").update({ score_cierre, score_confianza }).eq("id", id);
  }
}

export async function buscarServiciosSimilares(
  titulo: string,
  contenido: string,
  excludeId?: string
): Promise<{ id: string; titulo: string; similitud: number }[]> {
  const embedding = await generarEmbedding(`${titulo}\n${contenido}`);
  const { data } = await db().rpc("buscar_servicios", {
    query_embedding: embedding,
    limite: 5,
    umbral: 0.75,
  });
  return ((data ?? []) as { id: string; titulo: string; similitud: number }[])
    .filter(r => r.id !== excludeId);
}

function calcularScore(uso: number, cierre: number): number {
  return Math.round((cierre / Math.max(uso, 1) * 0.6 + Math.min(uso / 50, 1) * 0.4) * 100) / 100;
}
