import { createServiceClient } from "@/lib/supabase/service";
import { enrollarLeadEnProtocolosPorEtapa } from "@/services/lead-protocolo";
import type { MovidoPor, PipelineRuta } from "@/lib/supabase/types";

export interface PipelineActivo {
  id: string;
  ruta: string;
  etapa_actual: string;
  fases_cagc: number[];
  activo: boolean;
  updated_at: string;
}

// S13.5 — Inscribe un lead en un pipeline. Idempotente: si ya existe, no hace nada.
export async function inscribirEnPipeline(
  leadId: string,
  ruta: string,
  etapaInicial = "Nuevo"
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("lead_pipelines")
    .upsert(
      { lead_id: leadId, ruta, etapa_actual: etapaInicial, activo: true },
      { onConflict: "lead_id,ruta", ignoreDuplicates: true }
    );
  if (error) throw new Error(`[pipeline-multi] Error inscribiendo: ${error.message}`);
}

// S13.5 — Devuelve todos los pipelines activos de un lead con su etapa actual
// y las fases CAGC de cada etapa (join con pipeline_etapas).
export async function obtenerPipelinesActivos(leadId: string): Promise<PipelineActivo[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("lead_pipelines")
    .select("id, ruta, etapa_actual, activo, updated_at")
    .eq("lead_id", leadId)
    .eq("activo", true)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`[pipeline-multi] Error obteniendo pipelines: ${error.message}`);
  if (!data?.length) return [];

  // Enriquecer con fases_cagc de cada etapa
  const resultado: PipelineActivo[] = [];
  for (const lp of data) {
    const { data: etapa } = await supabase
      .from("pipeline_etapas")
      .select("fases_cagc")
      .eq("nombre", lp.etapa_actual)
      .eq("ruta", lp.ruta as PipelineRuta)
      .maybeSingle();

    resultado.push({
      ...lp,
      fases_cagc: (etapa?.fases_cagc as number[] | null) ?? [],
    });
  }
  return resultado;
}

// S13.5 — Mueve un lead dentro de un pipeline específico.
// Operación de bajo nivel: no dispara efectos de negocio (Brevo, Stripe, etc.).
// Los efectos del pipeline PRIMARIO siguen siendo responsabilidad de moverLead().
export async function moverLeadEnPipeline(
  leadId: string,
  ruta: string,
  nuevaEtapa: string,
  movidoPor: MovidoPor,
  motivo?: string
): Promise<void> {
  const supabase = createServiceClient();

  // Verificar que la etapa exista en esta ruta
  const { data: etapaValida } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre")
    .eq("nombre", nuevaEtapa)
    .eq("ruta", ruta as PipelineRuta)
    .eq("activo", true)
    .maybeSingle();

  if (!etapaValida) {
    throw new Error(`[pipeline-multi] Etapa "${nuevaEtapa}" no existe en ruta "${ruta}"`);
  }

  // Obtener etapa anterior para historial
  const { data: actual } = await supabase
    .from("lead_pipelines")
    .select("etapa_actual")
    .eq("lead_id", leadId)
    .eq("ruta", ruta)
    .maybeSingle();

  const etapaAnterior = actual?.etapa_actual ?? null;

  // Upsert posición actual
  const { error: upsertError } = await supabase
    .from("lead_pipelines")
    .upsert(
      { lead_id: leadId, ruta, etapa_actual: nuevaEtapa, activo: true },
      { onConflict: "lead_id,ruta" }
    );
  if (upsertError) throw new Error(`[pipeline-multi] Error moviendo: ${upsertError.message}`);

  // Enrolar en protocolos de seguimiento asignados a esta etapa
  void enrollarLeadEnProtocolosPorEtapa(leadId, etapaValida.id).catch(console.error);

  // Registrar en historial con ruta
  await supabase.from("pipeline_movimientos").insert({
    lead_id: leadId,
    etapa_anterior: etapaAnterior,
    etapa_nueva: nuevaEtapa,
    motivo: motivo ?? null,
    movido_por: movidoPor,
    ruta,
  });
}

// S13.6 — Carga los pipelines activos de múltiples leads en una sola query.
// Devuelve un mapa { leadId → [{ruta, etapa_actual}] } listo para la UI del Kanban.
export async function obtenerPipelinesActivosBatch(
  leadIds: string[]
): Promise<Record<string, { ruta: string; etapa_actual: string }[]>> {
  if (leadIds.length === 0) return {};
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("lead_pipelines")
    .select("lead_id, ruta, etapa_actual")
    .in("lead_id", leadIds)
    .eq("activo", true);

  if (error) throw new Error(`[pipeline-multi] Error batch: ${error.message}`);

  const mapa: Record<string, { ruta: string; etapa_actual: string }[]> = {};
  for (const row of data ?? []) {
    if (!mapa[row.lead_id]) mapa[row.lead_id] = [];
    mapa[row.lead_id].push({ ruta: row.ruta, etapa_actual: row.etapa_actual });
  }
  return mapa;
}

// S13.5 — Desactiva la participación de un lead en un pipeline.
// El lead permanece en el otro/otros pipelines activos.
export async function salirDePipeline(leadId: string, ruta: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("lead_pipelines")
    .update({ activo: false })
    .eq("lead_id", leadId)
    .eq("ruta", ruta);
  if (error) throw new Error(`[pipeline-multi] Error saliendo de pipeline: ${error.message}`);
}
