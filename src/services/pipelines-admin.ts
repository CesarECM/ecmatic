import { createServiceClient } from "@/lib/supabase/service";

export interface Pipeline {
  id: string;
  ruta: string;
  nombre: string;
  descripcion: string | null;
  servicio_id: string | null;
  tipo: "tronco" | "rama";
  fase_cagc_inicio: number | null;
  fase_cagc_fin: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineConConteo extends Pipeline {
  total_etapas: number;
  leads_activos: number;
}

export interface NuevoPipelineInput {
  nombre: string;
  descripcion?: string;
  servicio_id?: string;
  tipo?: "tronco" | "rama";
  fase_cagc_inicio?: number;
  fase_cagc_fin?: number;
}

export interface ActualizarPipelineInput {
  nombre?: string;
  descripcion?: string;
  servicio_id?: string | null;
  tipo?: "tronco" | "rama";
  fase_cagc_inicio?: number | null;
  fase_cagc_fin?: number | null;
  activo?: boolean;
}

function slugificar(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServiceClient() as any;
}

export async function listarPipelines(): Promise<PipelineConConteo[]> {
  const supabase = db();

  const { data: pipelines, error } = await supabase
    .from("pipelines")
    .select("*")
    .order("created_at");

  if (error) throw new Error(`[pipelines-admin] listarPipelines: ${error.message}`);

  const rutas: string[] = (pipelines ?? []).map((p: Pipeline) => p.ruta);
  if (!rutas.length) return [];

  const [etapasRes, leadsRes] = await Promise.all([
    supabase
      .from("pipeline_etapas")
      .select("ruta")
      .in("ruta", rutas)
      .eq("activo", true),
    supabase
      .from("leads")
      .select("pipeline_ruta")
      .in("pipeline_ruta", rutas)
      .eq("activo", true),
  ]);

  const etapaCount = new Map<string, number>();
  const leadCount  = new Map<string, number>();
  (etapasRes.data ?? []).forEach((r: { ruta: string }) =>
    etapaCount.set(r.ruta, (etapaCount.get(r.ruta) ?? 0) + 1)
  );
  (leadsRes.data ?? []).forEach((r: { pipeline_ruta: string }) =>
    leadCount.set(r.pipeline_ruta, (leadCount.get(r.pipeline_ruta) ?? 0) + 1)
  );

  return (pipelines ?? []).map((p: Pipeline) => ({
    ...p,
    total_etapas: etapaCount.get(p.ruta) ?? 0,
    leads_activos: leadCount.get(p.ruta) ?? 0,
  }));
}

export async function obtenerPipeline(id: string): Promise<Pipeline> {
  const { data, error } = await db()
    .from("pipelines")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error(`[pipelines-admin] Pipeline no encontrado: ${id}`);
  return data as Pipeline;
}

export async function crearPipeline(input: NuevoPipelineInput): Promise<Pipeline> {
  const ruta = slugificar(input.nombre) + "_" + Date.now().toString(36);

  const { data, error } = await db()
    .from("pipelines")
    .insert({
      ruta,
      nombre:           input.nombre,
      descripcion:      input.descripcion ?? null,
      servicio_id:      input.servicio_id ?? null,
      tipo:             input.tipo ?? "tronco",
      fase_cagc_inicio: input.fase_cagc_inicio ?? null,
      fase_cagc_fin:    input.fase_cagc_fin ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`[pipelines-admin] crearPipeline: ${error.message}`);
  return data as Pipeline;
}

export async function actualizarPipeline(
  id: string,
  input: ActualizarPipelineInput
): Promise<Pipeline> {
  const { data, error } = await db()
    .from("pipelines")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`[pipelines-admin] actualizarPipeline: ${error.message}`);
  return data as Pipeline;
}

export async function eliminarPipeline(id: string): Promise<void> {
  const { data: pipeline } = await db()
    .from("pipelines")
    .select("ruta, leads_activos:leads(count)")
    .eq("id", id)
    .single();

  if (!pipeline) throw new Error("[pipelines-admin] Pipeline no encontrado");

  const { count } = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_ruta", pipeline.ruta)
    .eq("activo", true);

  if ((count ?? 0) > 0) {
    throw new Error("No se puede eliminar: el pipeline tiene leads activos");
  }

  const { error } = await db()
    .from("pipelines")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`[pipelines-admin] eliminarPipeline: ${error.message}`);
}
