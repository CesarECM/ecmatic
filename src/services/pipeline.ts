import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { registrarCierre } from "@/services/conocimiento";
import { actualizarListasAlMoverEtapa, excluirDeNurturing } from "@/lib/email/campanas";
import { actualizarScoreMatriz } from "@/services/matriz";
import { clasificarLead } from "@/services/avatares";
import { calcularCalidadConversacion } from "@/services/calidad-conversacional";
import { registrarConversionExperimento } from "@/services/experimentos";
import { obtenerFaseLead } from "@/services/cagc";
import type { PipelineRuta, MovidoPor } from "@/lib/supabase/types";

export interface FiltrosLeads {
  etapa?: string;
  ruta?: PipelineRuta;
  vendedorId?: string;
  activo?: boolean;
}

export interface EtapaPipeline {
  id: string;
  nombre: string;
  orden: number;
  ruta: string;
  fases_cagc: number[];
}

// S3.1 — Obtiene etapas ordenadas de una ruta de pipeline (incluye mapeo CAGC)
export async function obtenerEtapas(ruta: PipelineRuta): Promise<EtapaPipeline[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre, orden, ruta, fases_cagc")
    .eq("ruta", ruta)
    .eq("activo", true)
    .order("orden");

  if (error) throw new Error(`[pipeline] Error obteniendo etapas: ${error.message}`);
  return (data ?? []) as EtapaPipeline[];
}

// S13.4 — Devuelve las fases CAGC asociadas a una etapa de pipeline concreta.
// Útil para inferir el estado del comprador a partir de su posición en el pipeline.
export async function fasesCAGCDeEtapa(
  etapaNombre: string,
  ruta: PipelineRuta
): Promise<number[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("pipeline_etapas")
    .select("fases_cagc")
    .eq("nombre", etapaNombre)
    .eq("ruta", ruta)
    .maybeSingle();
  return (data?.fases_cagc as number[] | null) ?? [];
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
    .select("pipeline_stage, pipeline_ruta, email")
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

  // S3.6 — Acredita recursos KB cuando el lead compra
  if (nuevaEtapa === "Comprado") void acreditarRecursosAlCerrar(leadId);

  // S4.3 — Sincroniza listas de Brevo al mover etapa
  void actualizarListasAlMoverEtapa(
    lead.email ?? null,
    lead.pipeline_stage,
    nuevaEtapa
  ).catch(console.error);

  // S4.3 — Excluye de nurturing al cerrar el ciclo
  if (nuevaEtapa === "Comprado" || nuevaEtapa === "Perdido") {
    void excluirDeNurturing(lead.email ?? null, lead.pipeline_ruta).catch(console.error);
  }

  // S5.4 — Actualiza score de efectividad en Matriz nD al cerrar o perder
  if (nuevaEtapa === "Comprado" || nuevaEtapa === "Perdido") {
    void actualizarDimensionesAlCerrar(leadId, nuevaEtapa === "Comprado");
  }

  // S11.2 — Calcula calidad conversacional al cerrar
  if (nuevaEtapa === "Comprado" || nuevaEtapa === "Perdido") {
    void calcularCalidadConversacion(leadId, nuevaEtapa === "Comprado").catch(console.error);
  }

  // S11.4 — Registra conversión en experimento de precio si aplica
  if (nuevaEtapa === "Comprado") {
    void registrarConversionExperimento(leadId).catch(console.error);
  }

  // S5.6 — Clasifica el lead en un avatar al avanzar etapas relevantes
  void clasificarLead(leadId).catch(console.error);
}

// S5.4 / S13.4 — Lee dimensiones 8D del lead y actualiza score de matriz al cerrar
async function actualizarDimensionesAlCerrar(leadId: string, cerrado: boolean): Promise<void> {
  try {
    const supabase = createServiceClient();
    const [{ data: lead }, estadoCagc] = await Promise.all([
      supabase
        .from("leads")
        .select("temperamento_inferido, canal_origen, pipeline_ruta, pipeline_stage")
        .eq("id", leadId)
        .single(),
      obtenerFaseLead(leadId).catch(() => null),
    ]);
    if (!lead) return;

    await actualizarScoreMatriz(
      {
        temperamento: lead.temperamento_inferido ?? undefined,
        canal_origen: lead.canal_origen ?? undefined,
        etapa_atasco: lead.pipeline_stage ?? undefined,
        fase_cagc: estadoCagc?.fase_numero,
      },
      cerrado
    );
  } catch {
    // no bloquear
  }
}

// S3.6 — Busca semánticamente los recursos usados en la conversación y los acredita
async function acreditarRecursosAlCerrar(leadId: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data: mensajes } = await supabase
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", leadId)
      .eq("direccion", "entrante")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!mensajes?.length) return;

    const query = mensajes.map((m) => m.contenido).join(" ");
    const embedding = await generarEmbedding(query);

    const { data: recursos } = await supabase.rpc("buscar_recursos", {
      query_embedding: embedding,
      limite: 5,
      umbral: 0.65,
    });

    const ids = (recursos ?? []).map((r: { id: string }) => r.id);
    await registrarCierre(ids);
  } catch {
    // No bloquear el flujo principal si falla la acreditación
  }
}

// S3.1 — Lista leads con filtros opcionales para el panel admin
export async function listarLeads(filtros: FiltrosLeads = {}) {
  const supabase = createServiceClient();

  // Selección explícita: evita traer metadata (JSONB pesado) y columnas no usadas en la lista
  let query = supabase
    .from("leads")
    .select("id, nombre, telefono, email, pipeline_stage, pipeline_ruta, temperamento_inferido, score_salud, compra_previa, updated_at")
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
