// S23.7 — Validador: todo lead en tarea activa debe tener punto de contacto futuro programado
import { createServiceClient } from "@/lib/supabase/service";

export interface LeadSinContacto {
  leadId: string;
  nombre: string | null;
  tipoTarea: string;
  tareaVence: string | null;
}

// Detecta leads con tarea activa pero sin punto de contacto futuro
// "Próximo contacto" = mensaje pendiente en cola O cita pendiente OR nurturing pendiente
export async function detectarLeadsSinContacto(): Promise<LeadSinContacto[]> {
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();

  type TareaRow = { lead_id: string; tipo: string; vence_at: string | null; nombre: string | null; archivado: boolean; activo: boolean };

  // Leads con tarea activa (excluye archivados y en blacklist)
  const { data: tareasRaw } = await supabase
    .from("lead_tarea_activa")
    .select("lead_id, tipo, vence_at, leads(nombre, archivado, activo)")
    .order("created_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareas: TareaRow[] = (tareasRaw ?? []).map((t: any) => ({
    lead_id: t.lead_id,
    tipo: t.tipo,
    vence_at: t.vence_at,
    nombre: t.leads?.nombre ?? null,
    archivado: t.leads?.archivado ?? false,
    activo: t.leads?.activo ?? false,
  }));

  if (tareas.length === 0) return [];

  const leadsSinContacto: LeadSinContacto[] = [];

  for (const tarea of tareas) {
    if (tarea.archivado || !tarea.activo) continue;

    const leadId = tarea.lead_id;

    // Verificar si existe un mensaje pendiente en cola de aprobación
    const { data: cola } = await supabase
      .from("mensajes_cola_aprobacion")
      .select("id")
      .eq("lead_id", leadId)
      .is("aprobado", null)
      .limit(1);

    if (cola && cola.length > 0) continue;

    // Verificar si existe una cita pendiente futura
    const { data: cita } = await supabase
      .from("citas")
      .select("id")
      .eq("lead_id", leadId)
      .eq("estado", "pendiente")
      .gt("fecha_inicio", ahora)
      .limit(1);

    if (cita && cita.length > 0) continue;

    // Verificar si hay nurturing pendiente
    const { data: nurturing } = await supabase
      .from("nurturing_envios")
      .select("id")
      .eq("lead_id", leadId)
      .eq("estado", "pendiente")
      .limit(1);

    if (nurturing && nurturing.length > 0) continue;

    leadsSinContacto.push({
      leadId,
      nombre: tarea.nombre,
      tipoTarea: tarea.tipo,
      tareaVence: tarea.vence_at,
    });
  }

  return leadsSinContacto;
}

// Genera alertas en sugerencias_ia para cada lead sin contacto próximo
export async function alertarLeadsSinContacto(): Promise<number> {
  const supabase = createServiceClient();
  const leads = await detectarLeadsSinContacto();

  let alertasCreadas = 0;
  for (const lead of leads) {
    const nombre = lead.nombre ?? `Lead ${lead.leadId.slice(0, 8)}`;
    await supabase.from("sugerencias_ia").insert({
      tipo: "general",
      titulo: `Sin contacto próximo: ${nombre}`,
      descripcion: `"${nombre}" tiene tarea "${lead.tipoTarea}" activa pero ningún punto de contacto futuro programado (sin mensaje en cola, cita pendiente ni nurturing activo). Programa el próximo contacto.`,
      prioridad: "importante",
      metadata: {
        categoria: "contacto_obligatorio",
        lead_id: lead.leadId,
        tipo_tarea: lead.tipoTarea,
        tarea_vence: lead.tareaVence,
      },
    });
    alertasCreadas++;
  }

  return alertasCreadas;
}
