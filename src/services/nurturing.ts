import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineRuta } from "@/lib/supabase/types";

export type CanalNurturing = "whatsapp" | "email";
export type EstadoEnvio = "pendiente" | "enviado" | "fallido" | "omitido";

export interface Secuencia {
  id: string;
  nombre: string;
  canal: CanalNurturing;
  etapa_pipeline: string | null;
  ruta: PipelineRuta | null;
  dias_sin_respuesta: number;
  plantilla_id: string | null;
  mensaje_fallback: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadParaNurturing {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  pipeline_stage: string;
  pipeline_ruta: PipelineRuta;
  dias_inactivo: number;
  secuencia_aplicable: Secuencia;
}

// S4.1 — Lista secuencias de nurturing, opcionalmente solo las activas
export async function listarSecuencias(soloActivas = false): Promise<Secuencia[]> {
  const supabase = createServiceClient();
  let query = supabase.from("nurturing_secuencias").select("*").order("orden");
  if (soloActivas) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw new Error(`[nurturing] Error listando secuencias: ${error.message}`);
  return (data ?? []) as Secuencia[];
}

// S4.1 — Crea una nueva secuencia de nurturing
export async function crearSecuencia(
  input: Omit<Secuencia, "id" | "created_at" | "updated_at">
): Promise<Secuencia> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nurturing_secuencias")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`[nurturing] Error creando secuencia: ${error.message}`);
  return data as Secuencia;
}

// S4.1 — Actualiza campos de una secuencia existente
export async function actualizarSecuencia(
  id: string,
  cambios: Partial<Omit<Secuencia, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("nurturing_secuencias").update(cambios).eq("id", id);
  if (error) throw new Error(`[nurturing] Error actualizando secuencia: ${error.message}`);
}

// S4.1/S4.6 — Identifica leads que califican para nurturing
// Excluye: etapas terminales, ticket abierto/en_atencion, pausados manualmente,
//          > 3 envíos en últimos 7 días, ticket cerrado hace < 48h
export async function obtenerLeadsParaNurturing(): Promise<LeadParaNurturing[]> {
  const supabase = createServiceClient();
  const secuencias = await listarSecuencias(true);
  if (!secuencias.length) return [];

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, nombre, telefono, email, pipeline_stage, pipeline_ruta, updated_at, metadata")
    .eq("activo", true)
    .not("pipeline_stage", "in", '("Comprado","Perdido")');

  if (error) throw new Error(`[nurturing] Error obteniendo leads: ${error.message}`);
  if (!leads?.length) return [];

  // S4.6 — Exclusión 1: leads con ticket abierto o en atención
  const { data: ticketsAbiertos } = await supabase
    .from("tickets")
    .select("lead_id")
    .in("estado", ["abierto", "en_atencion"]);
  const idsConTicket = new Set((ticketsAbiertos ?? []).map((t) => t.lead_id));

  // S4.6 — Exclusión 2: leads con ticket cerrado hace < 48h (recién salidos de handoff)
  const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: ticketsCerradosRecientes } = await supabase
    .from("tickets")
    .select("lead_id")
    .eq("estado", "cerrado")
    .gte("updated_at", hace48h);
  const idsTicketReciente = new Set((ticketsCerradosRecientes ?? []).map((t) => t.lead_id));

  // S4.6 — Exclusión 3: leads con > 3 envíos nurturing en los últimos 7 días
  const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: enviosRecientes } = await supabase
    .from("nurturing_envios")
    .select("lead_id")
    .eq("estado", "enviado")
    .gte("created_at", hace7d);
  const conteoSemanal = new Map<string, number>();
  for (const e of enviosRecientes ?? []) {
    conteoSemanal.set(e.lead_id, (conteoSemanal.get(e.lead_id) ?? 0) + 1);
  }

  const { data: ultimosMensajes } = await supabase
    .from("mensajes")
    .select("lead_id, created_at")
    .in("lead_id", leads.map((l) => l.id))
    .eq("direccion", "saliente")
    .order("created_at", { ascending: false });

  const ultimoContacto = new Map<string, Date>();
  for (const m of ultimosMensajes ?? []) {
    if (!ultimoContacto.has(m.lead_id)) {
      ultimoContacto.set(m.lead_id, new Date(m.created_at));
    }
  }

  const ahora = new Date();
  const resultado: LeadParaNurturing[] = [];

  for (const lead of leads) {
    if (idsConTicket.has(lead.id)) continue;
    if (idsTicketReciente.has(lead.id)) continue;
    if ((conteoSemanal.get(lead.id) ?? 0) >= 3) continue;
    // S4.6 — Exclusión 4: pausa manual en metadata del lead
    const meta = lead.metadata as Record<string, unknown> | null;
    if (meta?.nurturing_pausado === true) continue;

    const fechaRef = ultimoContacto.get(lead.id) ?? new Date(lead.updated_at);
    const diasInactivo = Math.floor(
      (ahora.getTime() - fechaRef.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Encuentra la secuencia más específica que aplica (ruta + etapa > solo etapa > general)
    const secuenciaAplicable = secuencias.find((s) => {
      const rutaOk = s.ruta === null || s.ruta === lead.pipeline_ruta;
      const etapaOk = s.etapa_pipeline === null || s.etapa_pipeline === lead.pipeline_stage;
      return rutaOk && etapaOk && diasInactivo >= s.dias_sin_respuesta;
    });

    if (secuenciaAplicable) {
      resultado.push({ ...lead, dias_inactivo: diasInactivo, secuencia_aplicable: secuenciaAplicable });
    }
  }

  return resultado;
}

// S4.1 — Registra el resultado de un intento de contacto nurturing
export async function registrarEnvioNurturing(
  leadId: string,
  secuenciaId: string,
  canal: CanalNurturing,
  estado: EstadoEnvio,
  errorDetalle?: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("nurturing_envios").insert({
    lead_id: leadId,
    secuencia_id: secuenciaId,
    canal,
    estado,
    error_detalle: errorDetalle ?? null,
  });
  if (error) throw new Error(`[nurturing] Error registrando envío: ${error.message}`);
}

// S4.1 — Historial de intentos de nurturing para un lead
export async function obtenerHistorialNurturing(leadId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nurturing_envios")
    .select("id, secuencia_id, canal, estado, error_detalle, created_at, nurturing_secuencias(nombre)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[nurturing] Error obteniendo historial: ${error.message}`);
  return data ?? [];
}

// S4.1 — Verifica si un lead ya recibió una secuencia en las últimas 24h (anti-spam)
export async function yaRecibioSecuencia(leadId: string, secuenciaId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("nurturing_envios")
    .select("id")
    .eq("lead_id", leadId)
    .eq("secuencia_id", secuenciaId)
    .eq("estado", "enviado")
    .gte("created_at", hace24h)
    .maybeSingle();
  return data !== null;
}

// S4.6 — Pausa manualmente el nurturing de un lead (persiste en metadata)
export async function pausarNurturing(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};
  await supabase.from("leads").update({ metadata: { ...meta, nurturing_pausado: true } }).eq("id", leadId);
}

// S4.6 — Reanuda el nurturing de un lead pausado
export async function reanudarNurturing(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};
  delete meta.nurturing_pausado;
  await supabase.from("leads").update({ metadata: meta }).eq("id", leadId);
}

export type HistorialNurturing = Awaited<ReturnType<typeof obtenerHistorialNurturing>>[number];
