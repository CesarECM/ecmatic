// MPS-11 — Queries de solo lectura para el panel de monitoreo del motor de seguimiento.
import { createServiceClient } from "@/lib/supabase/service";

export interface SeguimientoKPIs {
  activos: number;
  atascados: number;      // activo + proximo_at ya venció → cron falla en estos
  escalados: number;      // payment que agotó intentos sin respuesta
  intentos_24h: number;
  por_tipo: { nurturing: number; conversational: number; payment: number; demo_agendado: number };
}

export interface SeguimientoRow {
  id: string;
  lead_id: string;
  nombre: string | null;
  tipo: string;
  nivel: number;
  proximo_at: string;
  ghl_contact_id: string | null;
  campana: string | null;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

const SEL = "id, lead_id, tipo, nivel, proximo_at, ghl_contact_id, campana, updated_at, leads(nombre)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRows(data: any[] | null): SeguimientoRow[] {
  return (data ?? []).map((r) => ({
    id:             r.id,
    lead_id:        r.lead_id,
    nombre:         (r.leads as { nombre: string | null } | null)?.nombre ?? null,
    tipo:           r.tipo,
    nivel:          r.nivel,
    proximo_at:     r.proximo_at,
    ghl_contact_id: r.ghl_contact_id ?? null,
    campana:        r.campana ?? null,
    updated_at:     r.updated_at,
  }));
}

export async function obtenerKPIsMonitor(): Promise<SeguimientoKPIs> {
  const ahora   = new Date().toISOString();
  const hace24h = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const [
    { count: activos },
    { count: atascados },
    { count: escalados },
    { count: intentos24h },
    { count: nurturing },
    { count: conversational },
    { count: payment },
    { count: demoAgendado },
  ] = await Promise.all([
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo"),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo").lte("proximo_at", ahora),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "escalado"),
    db().from("followup_attempts_log").select("id", { count: "exact", head: true }).gte("sent_at", hace24h),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo").eq("tipo", "nurturing"),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo").eq("tipo", "conversational"),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo").eq("tipo", "payment"),
    db().from("seguimiento_lead").select("id", { count: "exact", head: true }).eq("estado", "activo").eq("tipo", "demo_agendado"),
  ]);

  return {
    activos:      activos      ?? 0,
    atascados:    atascados    ?? 0,
    escalados:    escalados    ?? 0,
    intentos_24h: intentos24h  ?? 0,
    por_tipo: {
      nurturing:      nurturing      ?? 0,
      conversational: conversational ?? 0,
      payment:        payment        ?? 0,
      demo_agendado:  demoAgendado   ?? 0,
    },
  };
}

// Seguimientos activos cuyo proximo_at ya venció — el cron está fallando en estos leads.
export async function obtenerAtascados(): Promise<SeguimientoRow[]> {
  const { data } = await db()
    .from("seguimiento_lead")
    .select(SEL)
    .eq("estado", "activo")
    .lte("proximo_at", new Date().toISOString())
    .order("proximo_at", { ascending: true })
    .limit(20);
  return mapRows(data);
}

// Próximos N seguimientos activos ordenados por fecha de envío.
export async function obtenerProximosSeguimientos(): Promise<SeguimientoRow[]> {
  const { data } = await db()
    .from("seguimiento_lead")
    .select(SEL)
    .eq("estado", "activo")
    .gt("proximo_at", new Date().toISOString())
    .order("proximo_at", { ascending: true })
    .limit(15);
  return mapRows(data);
}

// Seguimientos en estado escalado (payment agotó intentos sin respuesta).
export async function obtenerEscalados(): Promise<SeguimientoRow[]> {
  const { data } = await db()
    .from("seguimiento_lead")
    .select(SEL)
    .eq("estado", "escalado")
    .order("updated_at", { ascending: false })
    .limit(10);
  return mapRows(data);
}
