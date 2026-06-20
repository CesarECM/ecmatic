// S17.5 — Tarea de fondo activa por lead (exactamente 1 por lead)
import { createServiceClient } from "@/lib/supabase/service";
import type { TipoTarea } from "@/lib/supabase/types";

export type { TipoTarea };

export interface TareaActiva {
  id: string;
  lead_id: string;
  tipo: TipoTarea;
  motivo: string | null;
  asignada_at: string;
  vence_at: string | null;
}

// Días de vigencia natural por tipo — usados al calcular vence_at
const DIAS_VENCIMIENTO: Record<TipoTarea, number> = {
  limpieza:    1,
  cierre:      1,
  informacion: 2,
  seguimiento: 3,
  nutricion:   7,
};

function calcularVencimiento(tipo: TipoTarea): string {
  const d = new Date();
  d.setDate(d.getDate() + DIAS_VENCIMIENTO[tipo]);
  return d.toISOString();
}

// Asigna (o reemplaza) la tarea activa del lead.
// El UNIQUE(lead_id) hace que el upsert siempre deje exactamente 1 fila.
export async function asignarTarea(
  leadId: string,
  tipo: TipoTarea,
  motivo?: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("lead_tarea_activa")
    .upsert(
      {
        lead_id:    leadId,
        tipo,
        motivo:     motivo ?? null,
        asignada_at: new Date().toISOString(),
        vence_at:   calcularVencimiento(tipo),
      },
      { onConflict: "lead_id" }
    );
  if (error) throw new Error(`[tareas] asignarTarea: ${error.message}`);
}

// Devuelve la tarea activa del lead, o null si no tiene ninguna.
export async function obtenerTareaActiva(leadId: string): Promise<TareaActiva | null> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("lead_tarea_activa")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw new Error(`[tareas] obtenerTareaActiva: ${error.message}`);
  return (data as TareaActiva) ?? null;
}

// Cierra (elimina) la tarea activa. No lanza si el lead no tenía tarea.
export async function cerrarTarea(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("lead_tarea_activa")
    .delete()
    .eq("lead_id", leadId);
  if (error) throw new Error(`[tareas] cerrarTarea: ${error.message}`);
}

export interface TareaConLead extends TareaActiva {
  lead_telefono: string;
  lead_nombre: string | null;
}

// Lista todas las tareas activas, opcionalmente filtradas por tipo.
// Para uso en panel admin y motor S17.6.
export async function listarTareas(tipo?: TipoTarea): Promise<TareaConLead[]> {
  const supabase = createServiceClient();
  let query = (supabase as any)
    .from("lead_tarea_activa")
    .select("*, leads(telefono, nombre)")
    .order("vence_at", { ascending: true, nullsFirst: false });

  if (tipo) query = query.eq("tipo", tipo);

  const { data, error } = await query;
  if (error) throw new Error(`[tareas] listarTareas: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    ...row,
    lead_telefono: row.leads?.telefono ?? "",
    lead_nombre:   row.leads?.nombre   ?? null,
  }));
}

// Cuenta tareas vencidas (vence_at en el pasado) para alertas en panel.
export async function contarTareasVencidas(): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await (supabase as any)
    .from("lead_tarea_activa")
    .select("id", { count: "exact", head: true })
    .lt("vence_at", new Date().toISOString());
  if (error) throw new Error(`[tareas] contarTareasVencidas: ${error.message}`);
  return count ?? 0;
}
