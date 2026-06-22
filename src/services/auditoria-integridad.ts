import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineRuta } from "@/lib/supabase/types";

export interface EslaboVerificacion {
  clave: string;
  label: string;
  ok: boolean;
  detalle: string | null;
}

export interface ResultadoIntegridadLead {
  leadId: string;
  nombre: string | null;
  telefono: string | null;
  eslabones: EslaboVerificacion[];
  totalFallidos: number;
}

// S29.5 — Verifica la cadena de integridad de un lead activo.
// Eslabones: nombre → pipeline → etapa válida → tarea activa → fase CAGC → cita con Calendar
export async function verificarIntegridadLead(
  lead: {
    id: string;
    nombre: string | null;
    telefono: string | null;
    pipeline_stage: string | null;
    pipeline_ruta: string | null;
  }
): Promise<ResultadoIntegridadLead> {
  const supabase = createServiceClient();

  const eslabones: EslaboVerificacion[] = [];

  // 1. Nombre capturado
  eslabones.push({
    clave: "nombre",
    label: "Nombre",
    ok: !!lead.nombre,
    detalle: lead.nombre ? null : "Nombre no capturado aún",
  });

  // 2. Etapa de pipeline válida
  let etapaValida = false;
  if (lead.pipeline_stage && lead.pipeline_ruta) {
    const { data: etapa } = await supabase
      .from("pipeline_etapas")
      .select("id")
      .eq("nombre", lead.pipeline_stage)
      .eq("ruta", lead.pipeline_ruta as PipelineRuta)
      .eq("activo", true)
      .maybeSingle();
    etapaValida = !!etapa;
  }
  eslabones.push({
    clave: "pipeline",
    label: "Pipeline/Etapa",
    ok: etapaValida,
    detalle: etapaValida
      ? null
      : `Etapa "${lead.pipeline_stage}" no existe en ruta "${lead.pipeline_ruta}"`,
  });

  // 3. Tarea de fondo activa
  const { data: tarea } = await (supabase as any)
    .from("lead_tarea_activa")
    .select("tipo")
    .eq("lead_id", lead.id)
    .maybeSingle();
  eslabones.push({
    clave: "tarea",
    label: "Tarea activa",
    ok: !!tarea,
    detalle: tarea ? null : "Sin tarea de fondo asignada",
  });

  // 4. Fase CAGC inferida
  const { data: cagcEstado } = await supabase
    .from("lead_cagc_estado")
    .select("fase_numero")
    .eq("lead_id", lead.id)
    .maybeSingle();
  eslabones.push({
    clave: "cagc",
    label: "Fase CAGC",
    ok: !!cagcEstado,
    detalle: cagcEstado ? null : "Fase CAGC nunca inferida",
  });

  // 5. Cita confirmada con evento de Calendar real
  const { data: citaConfirmada } = await supabase
    .from("citas")
    .select("id, google_event_id")
    .eq("lead_id", lead.id)
    .eq("estado", "confirmada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (citaConfirmada) {
    eslabones.push({
      clave: "calendar",
      label: "Cita en Calendar",
      ok: !!citaConfirmada.google_event_id,
      detalle: citaConfirmada.google_event_id
        ? null
        : "Cita confirmada sin google_event_id — no creada en Calendar",
    });
  }
  // Si no hay cita, no aplica este eslabón (no se añade)

  const totalFallidos = eslabones.filter((e) => !e.ok).length;
  return { leadId: lead.id, nombre: lead.nombre, telefono: lead.telefono, eslabones, totalFallidos };
}

// S29.6 — Audita todos los leads activos y genera alertas en sugerencias_ia
// para los que tengan eslabones rotos.
export async function auditarIntegridadTodos(): Promise<{ auditados: number; conFallas: number }> {
  const supabase = createServiceClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, nombre, telefono, pipeline_stage, pipeline_ruta")
    .eq("activo", true);

  if (!leads?.length) return { auditados: 0, conFallas: 0 };

  let conFallas = 0;

  for (const lead of leads) {
    const resultado = await verificarIntegridadLead(lead);
    if (resultado.totalFallidos === 0) continue;

    conFallas++;

    const nombreDisplay = lead.nombre ?? lead.telefono ?? lead.id.slice(0, 8);

    // Una sola alerta por lead con todos los eslabones fallidos
    const detalles = resultado.eslabones
      .filter((e) => !e.ok)
      .map((e) => `• ${e.label}: ${e.detalle}`)
      .join("\n");

    // Evitar duplicados: si ya hay alerta pendiente para este lead, saltar
    const { data: existente } = await supabase
      .from("sugerencias_ia")
      .select("id")
      .eq("tipo", "general")
      .ilike("titulo", `%Integridad: ${lead.id.slice(0, 8)}%`)
      .eq("aprobado", false)
      .maybeSingle();

    if (existente) continue;

    await supabase.from("sugerencias_ia").insert({
      tipo: "general",
      titulo: `Integridad: ${nombreDisplay} (${lead.id.slice(0, 8)})`,
      descripcion: `Lead con ${resultado.totalFallidos} eslabón(es) roto(s):\n${detalles}`,
      prioridad: resultado.totalFallidos >= 3 ? "urgente" : resultado.totalFallidos === 2 ? "importante" : "puede_esperar",
      metadata: {
        lead_id: lead.id,
        eslabones_fallidos: resultado.eslabones.filter((e) => !e.ok).map((e) => e.clave),
        accion: "auditoria_integridad",
      },
    });
  }

  return { auditados: leads.length, conFallas };
}

// S29.7 — Carga los resultados de integridad de todos los leads activos para la vista de matriz.
// Paginado para no cargar todos a la vez en producción.
export async function cargarMatrizIntegridad(pagina = 0, porPagina = 50): Promise<{
  resultados: ResultadoIntegridadLead[];
  total: number;
}> {
  const supabase = createServiceClient();

  const { data: leads, count } = await supabase
    .from("leads")
    .select("id, nombre, telefono, pipeline_stage, pipeline_ruta", { count: "exact" })
    .eq("activo", true)
    .order("created_at", { ascending: false })
    .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

  const resultados = await Promise.all(
    (leads ?? []).map((lead) => verificarIntegridadLead(lead))
  );

  return { resultados, total: count ?? 0 };
}
