import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { registrarCierre, registrarFalloRecursos } from "@/services/conocimiento";
import { actualizarListasAlMoverEtapa, excluirDeNurturing } from "@/lib/email/campanas";
import { actualizarScoreMatriz } from "@/services/matriz";
import { clasificarLead } from "@/services/avatares";
import { calcularCalidadConversacion } from "@/services/calidad-conversacional";
import { generarMemoriaLead } from "@/services/memoria-lead";
import { registrarConversionPrompt } from "@/services/prompt-experimentos";
import { registrarConversionExperimento } from "@/services/experimentos";
import { registrarConversionGHL } from "@/services/ab-workflows-ghl";
import { obtenerFaseLead } from "@/services/cagc";
import { inscribirEnPipeline } from "@/services/pipeline-multi";
import { asignarEtiquetaProducto } from "@/services/etiquetas-hooks";
import { asignarVarianteAB, registrarAvanceAB } from "@/services/pipeline-ab";
import { cerrarTarea } from "@/services/tareas";
import { enrollarLeadEnProtocolosPorEtapa } from "@/services/lead-protocolo";
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
  es_tronco: boolean;
  etapas_siguientes: string[];
}

// S3.1 — Obtiene etapas ordenadas de una ruta de pipeline (incluye mapeo CAGC y ramas)
export async function obtenerEtapas(ruta: PipelineRuta): Promise<EtapaPipeline[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre, orden, ruta, fases_cagc, es_tronco, etapas_siguientes")
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
    .select("pipeline_stage, pipeline_ruta, email, telefono")
    .eq("id", leadId)
    .single();

  if (fetchError || !lead) throw new Error(`[pipeline] Lead no encontrado: ${leadId}`);

  // Valida que la etapa exista en la ruta del lead
  const { data: etapaValida } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre")
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

  // Enrolar en protocolos de seguimiento asignados a esta etapa
  void enrollarLeadEnProtocolosPorEtapa(leadId, etapaValida.id).catch(console.error);

  // S13.5 — Mantener lead_pipelines sincronizado con el pipeline primario
  void inscribirEnPipeline(leadId, lead.pipeline_ruta, nuevaEtapa).catch(console.error);

  // S13.8 — A/B: registrar conversión en etapa anterior + asignar variante en la nueva
  void registrarAvanceAB(leadId, lead.pipeline_stage ?? "", lead.pipeline_ruta).catch(console.error);
  void asignarVarianteAB(leadId, nuevaEtapa, lead.pipeline_ruta).catch(console.error);

  await supabase.from("pipeline_movimientos").insert({
    lead_id: leadId,
    etapa_anterior: lead.pipeline_stage,
    etapa_nueva: nuevaEtapa,
    motivo: motivo ?? null,
    movido_por: movidoPor,
    ruta: lead.pipeline_ruta,
  });

  // S3.6 — Acredita recursos KB cuando el lead compra
  if (nuevaEtapa === "Comprado") void acreditarRecursosAlCerrar(leadId);

  // MPS-16 S58 — Señales de conversación sobre score KB
  if (nuevaEtapa === "Perdido") void registrarFalloConversacion(leadId);
  if (nuevaEtapa !== "Comprado" && nuevaEtapa !== "Perdido") {
    void registrarAvancePipeline(leadId);
  }

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
    void generarMemoriaLead(leadId).catch(console.error);
  }

  // S11.4 — Registra conversión en experimento de precio si aplica
  if (nuevaEtapa === "Comprado") {
    void registrarConversionExperimento(leadId).catch(console.error);
    void registrarConversionPrompt(leadId).catch(console.error);
    // S70.1 — Señal de conversión GHL: solo cuando el lead vino por el path GHL
    const telefono = (lead as Record<string, unknown>).telefono as string | null;
    if (typeof telefono === "string" && telefono.startsWith("ghl_")) {
      void registrarConversionGHL(telefono.slice(4), process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26").catch(console.error);
    }
  }

  // S14.4 — Auto-etiqueta con producto comprado
  if (nuevaEtapa === "Comprado") {
    void asignarEtiquetaProducto(leadId, lead.pipeline_ruta).catch(console.error);
  }

  // S17.7 — Venta: cerrar tarea de fondo al convertir
  if (nuevaEtapa === "Comprado") {
    void cerrarTarea(leadId).catch(console.error);
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

// S3.6 — Busca semánticamente los recursos KB relevantes y los acredita con señal fuerte (+2).
// Usa mensajes entrantes (preguntas del lead) para encontrar los recursos más relevantes.
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
      query_embedding: embedding, limite: 5, umbral: 0.65,
    });
    const ids = (recursos ?? []).map((r: { id: string }) => r.id);
    // incremento=2: conversión vale el doble que un avance intermedio
    await registrarCierre(ids, 2);
  } catch {
    // No bloquear el flujo principal
  }
}

// MPS-16 S58 — Señal leve (+1) al avanzar etapa: top 2 recursos más relevantes.
// Usa mensajes salientes (respuestas de la IA) para reflejar qué recursos se usaron.
async function registrarAvancePipeline(leadId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: mensajes } = await supabase
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", leadId)
      .eq("direccion", "saliente")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!mensajes?.length) return;
    const query = mensajes.map((m) => m.contenido).join(" ");
    const embedding = await generarEmbedding(query);
    const { data: recursos } = await supabase.rpc("buscar_recursos", {
      query_embedding: embedding, limite: 2, umbral: 0.65,
    });
    const ids = (recursos ?? []).map((r: { id: string }) => r.id);
    await registrarCierre(ids, 1);
  } catch {
    // No bloquear el flujo principal
  }
}

// MPS-16 S58 — Señal negativa leve cuando el lead se pierde.
// Penaliza ligeramente los recursos usados en los últimos mensajes de la IA.
async function registrarFalloConversacion(leadId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: mensajes } = await supabase
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", leadId)
      .eq("direccion", "saliente")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!mensajes?.length) return;
    const query = mensajes.map((m) => m.contenido).join(" ");
    const embedding = await generarEmbedding(query);
    const { data: recursos } = await supabase.rpc("buscar_recursos", {
      query_embedding: embedding, limite: 3, umbral: 0.65,
    });
    const ids = (recursos ?? []).map((r: { id: string }) => r.id);
    await registrarFalloRecursos(ids);
  } catch {
    // No bloquear el flujo principal
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

  const { error, data } = await supabase
    .from("leads")
    .update({ vendedor_id: vendedorId })
    .eq("id", leadId)
    .select("id");

  if (error) throw new Error(`[pipeline] Error asignando vendedor: ${error.message} (code: ${error.code})`);
  if (!data?.length) throw new Error(`[pipeline] Lead ${leadId} no encontrado o sin filas actualizadas`);
}

// S3.1 — Obtiene el historial de movimientos de un lead
export async function obtenerHistorialPipeline(leadId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("pipeline_movimientos")
    .select("id, etapa_anterior, etapa_nueva, motivo, movido_por, ruta, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[pipeline] Error obteniendo historial: ${error.message}`);
  return data ?? [];
}

export type LeadRow = Awaited<ReturnType<typeof listarLeads>>[number];
