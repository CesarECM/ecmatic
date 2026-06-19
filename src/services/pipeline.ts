import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineRuta, MovidoPor } from "@/lib/supabase/types";

export interface FiltrosLeads {
  etapa?: string;
  ruta?: PipelineRuta;
  vendedorId?: string;
  activo?: boolean;
}

// S3.1 — Obtiene etapas ordenadas de una ruta de pipeline
export async function obtenerEtapas(ruta: PipelineRuta) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre, orden, ruta")
    .eq("ruta", ruta)
    .eq("activo", true)
    .order("orden");

  if (error) throw new Error(`[pipeline] Error obteniendo etapas: ${error.message}`);
  return data ?? [];
}

// S3.1 — Mueve un lead a una nueva etapa y registra el movimiento
export async function moverLead(
  leadId: string,
  nuevaEtapa: string,
  movidoPor: MovidoPor,
  motivo?: string
) {
  const supabase = createServiceClient();

  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("pipeline_stage, pipeline_ruta")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) throw new Error(`[pipeline] Lead no encontrado: ${leadId}`);

  // Valida que la etapa exista en la ruta del lead
  const { data: etapaValida } = await supabase
    .from("pipeline_etapas")
    .select("nombre")
    .eq("nombre", nuevaEtapa)
    .eq("ruta", lead.pipeline_ruta)
    .eq("activo", true)
    .maybeSingle();

  if (!etapaValida) {
    throw new Error(`[pipeline] Etapa "${nuevaEtapa}" no existe en ruta ${lead.pipeline_ruta}`);
  }

  await supabase
    .from("leads")
    .update({ pipeline_stage: nuevaEtapa })
    .eq("id", leadId);

  await supabase.from("pipeline_movimientos").insert({
    lead_id: leadId,
    etapa_anterior: lead.pipeline_stage,
    etapa_nueva: nuevaEtapa,
    motivo: motivo ?? null,
    movido_por: movidoPor,
  });
}

// S3.1 — Lista leads con filtros opcionales para el panel admin
export async function listarLeads(filtros: FiltrosLeads = {}) {
  const supabase = createServiceClient();

  let query = supabase
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filtros.etapa !== undefined) query = query.eq("pipeline_stage", filtros.etapa);
  if (filtros.ruta !== undefined) query = query.eq("pipeline_ruta", filtros.ruta);
  if (filtros.vendedorId !== undefined) query = query.eq("vendedor_id", filtros.vendedorId);
  if (filtros.activo !== undefined) query = query.eq("activo", filtros.activo);

  const { data, error } = await query;
  if (error) throw new Error(`[pipeline] Error listando leads: ${error.message}`);
  return data ?? [];
}

// S3.1 — Asigna o desasigna un vendedor a un lead
export async function asignarVendedor(leadId: string, vendedorId: string | null) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("leads")
    .update({ vendedor_id: vendedorId })
    .eq("id", leadId);

  if (error) throw new Error(`[pipeline] Error asignando vendedor: ${error.message}`);
}

// S3.1 — Obtiene el historial de movimientos de un lead
export async function obtenerHistorialPipeline(leadId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("pipeline_movimientos")
    .select("id, etapa_anterior, etapa_nueva, motivo, movido_por, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[pipeline] Error obteniendo historial: ${error.message}`);
  return data ?? [];
}

export type LeadRow = Awaited<ReturnType<typeof listarLeads>>[number];
