// S24.3 — CRUD de brochures: materiales informativos por servicio, enviados proactivamente.

import { createServiceClient } from "@/lib/supabase/service";

export interface Brochure {
  id: string;
  titulo: string;
  descripcion: string;
  recurso_id: string | null;
  url: string;
  fases_cagc_objetivo: number[];
  score_efectividad: number;
  activo: boolean;
  veces_ofrecido: number;
  veces_aceptado: number;
  created_at: string;
  updated_at: string;
}

export interface CrearBrochureInput {
  titulo: string;
  descripcion?: string;
  recurso_id?: string | null;
  url: string;
  fases_cagc_objetivo?: number[];
  score_efectividad?: number;
}

export async function listarBrochures(filtros?: {
  soloActivos?: boolean;
  faseCagc?: number;
  recursoId?: string;
}): Promise<Brochure[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("brochures")
    .select("*")
    .order("score_efectividad", { ascending: false });

  if (filtros?.soloActivos !== false) query = query.eq("activo", true);
  if (filtros?.faseCagc !== undefined) {
    query = query.contains("fases_cagc_objetivo", [filtros.faseCagc]);
  }
  if (filtros?.recursoId) query = query.eq("recurso_id", filtros.recursoId);

  const { data, error } = await query;
  if (error) throw new Error(`[brochures] Error listando: ${error.message}`);
  return (data ?? []) as Brochure[];
}

export async function obtenerBrochure(id: string): Promise<Brochure | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("brochures")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Brochure;
}

export async function crearBrochure(input: CrearBrochureInput): Promise<Brochure> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("brochures")
    .insert({
      titulo:              input.titulo,
      descripcion:         input.descripcion ?? "",
      recurso_id:          input.recurso_id ?? null,
      url:                 input.url,
      fases_cagc_objetivo: input.fases_cagc_objetivo ?? [],
      score_efectividad:   input.score_efectividad ?? 0.5,
    })
    .select()
    .single();
  if (error) throw new Error(`[brochures] Error creando: ${error.message}`);
  return data as Brochure;
}

export async function actualizarBrochure(
  id: string,
  campos: Partial<Omit<Brochure, "id" | "created_at" | "updated_at">>
): Promise<Brochure> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("brochures")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[brochures] Error actualizando: ${error.message}`);
  return data as Brochure;
}

export async function eliminarBrochure(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("brochures").delete().eq("id", id);
  if (error) throw new Error(`[brochures] Error eliminando: ${error.message}`);
}

export async function registrarOfrecimientoBrochure(
  id: string,
  aceptado: boolean
): Promise<void> {
  const supabase = createServiceClient();
  const b = await obtenerBrochure(id);
  if (!b) return;

  const veces_ofrecido = b.veces_ofrecido + 1;
  const veces_aceptado = b.veces_aceptado + (aceptado ? 1 : 0);
  const score_efectividad = veces_ofrecido > 0
    ? Math.min(1, Number((veces_aceptado / veces_ofrecido).toFixed(2)))
    : b.score_efectividad;

  await supabase
    .from("brochures")
    .update({ veces_ofrecido, veces_aceptado, score_efectividad })
    .eq("id", id);
}
