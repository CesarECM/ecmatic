import { createServiceClient } from "@/lib/supabase/service";

export type CanalEtapa = "whatsapp" | "email" | "llamada" | "meet";

export interface EtapaCanal {
  id: string;
  etapa_id: string;
  canal: CanalEtapa;
  activo: boolean;
}

// S28.3 — Obtiene los canales habilitados de una etapa
export async function obtenerCanalesEtapa(etapaId: string): Promise<EtapaCanal[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("etapa_canales")
    .select("*")
    .eq("etapa_id", etapaId)
    .eq("activo", true);
  if (error) throw new Error(`[etapa-canales] ${error.message}`);
  return (data ?? []) as EtapaCanal[];
}

// S28.3 — Activa o desactiva un canal en una etapa
export async function toggleCanalEtapa(
  etapaId: string,
  canal: CanalEtapa,
  activo: boolean
): Promise<void> {
  const supabase = createServiceClient();
  const { data: existente } = await supabase
    .from("etapa_canales")
    .select("id")
    .eq("etapa_id", etapaId)
    .eq("canal", canal)
    .maybeSingle();

  if (existente) {
    await supabase
      .from("etapa_canales")
      .update({ activo })
      .eq("id", existente.id)
      .throwOnError();
  } else {
    await supabase
      .from("etapa_canales")
      .insert({ etapa_id: etapaId, canal, activo })
      .throwOnError();
  }
}

// S28.3 — Verifica si un canal está habilitado para la etapa actual de un lead
export async function canalHabilitadoParaLead(
  leadId: string,
  canal: CanalEtapa
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("pipeline_stage, pipeline_ruta")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) return true; // fallback permisivo

  const { data: etapa } = await supabase
    .from("pipeline_etapas")
    .select("id")
    .eq("nombre", lead.pipeline_stage)
    .eq("ruta", lead.pipeline_ruta)
    .maybeSingle();

  if (!etapa) return true;

  const { data: canalData } = await supabase
    .from("etapa_canales")
    .select("activo")
    .eq("etapa_id", etapa.id)
    .eq("canal", canal)
    .maybeSingle();

  return canalData?.activo ?? true;
}
