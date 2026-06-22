import { createServiceClient } from "@/lib/supabase/service";

export type TipoRecursoEtapa = "leadmagnet" | "brochure";

export interface EtapaContenido {
  id: string;
  etapa_id: string;
  recurso_tipo: TipoRecursoEtapa;
  recurso_id: string;
  es_puente: boolean;
  etapa_origen_id: string | null;
  orden: number;
  activo: boolean;
}

// S28.5 — Lista el contenido asignado a una etapa (activo)
export async function listarContenidoEtapa(etapaId: string): Promise<EtapaContenido[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("etapa_contenido")
    .select("*")
    .eq("etapa_id", etapaId)
    .eq("activo", true)
    .order("orden");
  if (error) throw new Error(`[etapa-contenido] ${error.message}`);
  return (data ?? []) as EtapaContenido[];
}

// S28.5 — Asigna un brochure o leadmagnet a una etapa
export async function asignarContenidoEtapa(params: {
  etapaId: string;
  recursoTipo: TipoRecursoEtapa;
  recursoId: string;
  esPuente?: boolean;
  etapaOrigenId?: string;
  orden?: number;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("etapa_contenido")
    .upsert({
      etapa_id: params.etapaId,
      recurso_tipo: params.recursoTipo,
      recurso_id: params.recursoId,
      es_puente: params.esPuente ?? false,
      etapa_origen_id: params.etapaOrigenId ?? null,
      orden: params.orden ?? 0,
      activo: true,
    }, { onConflict: "etapa_id,recurso_tipo,recurso_id" })
    .throwOnError();
}

// S28.5 — Desvincula un recurso de una etapa (soft delete)
export async function desasignarContenidoEtapa(id: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("etapa_contenido")
    .update({ activo: false })
    .eq("id", id)
    .throwOnError();
}

// S28.5 — Devuelve los leadmagnets/brochures de la etapa actual de un lead,
// incluyendo los de puente de etapas posteriores.
export async function contenidoDisponibleParaLead(leadId: string): Promise<{
  leadmagnets: string[];
  brochures: string[];
}> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("pipeline_stage, pipeline_ruta")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) return { leadmagnets: [], brochures: [] };

  const { data: etapa } = await supabase
    .from("pipeline_etapas")
    .select("id")
    .eq("nombre", lead.pipeline_stage)
    .eq("ruta", lead.pipeline_ruta)
    .maybeSingle();

  if (!etapa) return { leadmagnets: [], brochures: [] };

  const { data: contenido } = await supabase
    .from("etapa_contenido")
    .select("recurso_tipo, recurso_id")
    .eq("etapa_id", etapa.id)
    .eq("activo", true);

  const items = contenido ?? [];
  return {
    leadmagnets: items
      .filter((c: { recurso_tipo: string }) => c.recurso_tipo === "leadmagnet")
      .map((c: { recurso_id: string }) => c.recurso_id),
    brochures: items
      .filter((c: { recurso_tipo: string }) => c.recurso_tipo === "brochure")
      .map((c: { recurso_id: string }) => c.recurso_id),
  };
}
