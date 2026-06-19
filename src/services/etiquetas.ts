import { createServiceClient } from "@/lib/supabase/service";

export interface Etiqueta {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  origen: "manual" | "ia_sugerido" | "automatico";
  estado: "activa" | "pendiente_revision" | "archivada";
  created_at: string;
}

export interface CategoriaConEtiquetas {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  etiquetas: Etiqueta[];
}

// Devuelve todas las categorías con sus etiquetas (no archivadas)
export async function listarCategorias(): Promise<CategoriaConEtiquetas[]> {
  const supabase = createServiceClient();
  const [{ data: cats, error }, { data: etqs }] = await Promise.all([
    supabase.from("etiqueta_categorias").select("id, nombre, descripcion, color").order("nombre"),
    supabase.from("etiquetas").select("id, categoria_id, nombre, descripcion, origen, estado, created_at")
      .neq("estado", "archivada").order("nombre"),
  ]);
  if (error) throw new Error(`[etiquetas] Error listando categorías: ${error.message}`);
  return (cats ?? []).map((c) => ({
    ...c,
    etiquetas: (etqs ?? []).filter((e) => e.categoria_id === c.id) as Etiqueta[],
  }));
}

// Etiquetas pendientes de aprobación (para cola de aprobaciones)
export async function listarPendientes(): Promise<(Etiqueta & { categoria_nombre: string })[]> {
  const supabase = createServiceClient();
  const [{ data: etqs, error }, { data: cats }] = await Promise.all([
    supabase.from("etiquetas").select("id, categoria_id, nombre, descripcion, origen, estado, created_at")
      .eq("estado", "pendiente_revision").order("created_at"),
    supabase.from("etiqueta_categorias").select("id, nombre"),
  ]);
  if (error) throw new Error(`[etiquetas] Error listando pendientes: ${error.message}`);
  const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, c.nombre]));
  return (etqs ?? []).map((e) => ({ ...e, categoria_nombre: catMap[e.categoria_id] ?? "" })) as (Etiqueta & { categoria_nombre: string })[];
}

// Crea una etiqueta (manual o IA-sugerida)
export async function crearEtiqueta(
  categoriaId: string,
  nombre: string,
  descripcion?: string,
  origen: Etiqueta["origen"] = "manual"
): Promise<Etiqueta> {
  const supabase = createServiceClient();
  const estado = origen === "manual" ? "activa" : "pendiente_revision";
  const { data, error } = await supabase
    .from("etiquetas")
    .insert({ categoria_id: categoriaId, nombre, descripcion, origen, estado })
    .select()
    .single();
  if (error) throw new Error(`[etiquetas] Error creando: ${error.message}`);
  return data as Etiqueta;
}

// Aprueba una etiqueta pendiente → pasa a activa
export async function aprobarEtiqueta(id: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("etiquetas").update({ estado: "activa" }).eq("id", id);
}

// Archiva una etiqueta (rechazar sugerencia o retirar etiqueta activa)
export async function archivarEtiqueta(id: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("etiquetas").update({ estado: "archivada" }).eq("id", id);
}

// Fusiona: reasigna todos los leads de `idOrigen` a `idDestino` y archiva la original
export async function fusionarEtiquetas(idOrigen: string, idDestino: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: leads } = await supabase
    .from("lead_etiquetas").select("lead_id").eq("etiqueta_id", idOrigen);
  for (const { lead_id } of leads ?? []) {
    await supabase.from("lead_etiquetas")
      .upsert({ lead_id, etiqueta_id: idDestino, asignada_por: "manual" }, { onConflict: "lead_id,etiqueta_id", ignoreDuplicates: true });
  }
  await supabase.from("lead_etiquetas").delete().eq("etiqueta_id", idOrigen);
  await archivarEtiqueta(idOrigen);
}

// Asigna una etiqueta activa a un lead (idempotente)
export async function asignarEtiqueta(
  leadId: string,
  etiquetaId: string,
  asignadaPor: "manual" | "ia" | "automatico" = "manual"
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("lead_etiquetas")
    .upsert({ lead_id: leadId, etiqueta_id: etiquetaId, asignada_por: asignadaPor },
             { onConflict: "lead_id,etiqueta_id", ignoreDuplicates: true });
}

// Obtiene todas las etiquetas activas de un lead con nombre y categoría
export async function obtenerEtiquetasLead(
  leadId: string
): Promise<{ id: string; nombre: string; categoria: string; color: string }[]> {
  const supabase = createServiceClient();
  const { data: asignaciones } = await supabase
    .from("lead_etiquetas").select("etiqueta_id").eq("lead_id", leadId);
  if (!asignaciones?.length) return [];

  const ids = asignaciones.map((a) => a.etiqueta_id);
  const [{ data: etqs }, { data: cats }] = await Promise.all([
    supabase.from("etiquetas").select("id, categoria_id, nombre, estado").in("id", ids).eq("estado", "activa"),
    supabase.from("etiqueta_categorias").select("id, nombre, color"),
  ]);
  const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, { nombre: c.nombre, color: c.color }]));
  return (etqs ?? []).map((e) => ({
    id: e.id, nombre: e.nombre,
    categoria: catMap[e.categoria_id]?.nombre ?? "",
    color: catMap[e.categoria_id]?.color ?? "#6B7280",
  }));
}

// Quita una etiqueta de un lead
export async function quitarEtiqueta(leadId: string, etiquetaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("lead_etiquetas")
    .delete().eq("lead_id", leadId).eq("etiqueta_id", etiquetaId);
}
