import { createServiceClient } from "@/lib/supabase/service";

export type PasoAgendamiento =
  | "slots_consultados"
  | "token_refresh"
  | "calendar_sync"
  | "meet_generado"
  | "cita_creada"
  | "estado_confirmado"
  | "notificacion_wa"
  | "notificacion_email_lead"
  | "notificacion_email_vendedor"
  | "error";

export type NivelLog = "info" | "warn" | "error";

export interface EntradaLogAgen {
  id: string;
  paso: string;
  nivel: string;
  detalle: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  cita_id: string | null;
  lead_id: string | null;
  vendedor_id: string | null;
  leads: { nombre: string | null; telefono: string | null } | null;
  vendedores: { nombre: string } | null;
}

export async function logAgen(params: {
  paso: PasoAgendamiento;
  nivel?: NivelLog;
  citaId?: string;
  leadId?: string;
  vendedorId?: string;
  detalle?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("log_agendamiento").insert({
    cita_id:     params.citaId     ?? null,
    lead_id:     params.leadId     ?? null,
    vendedor_id: params.vendedorId ?? null,
    paso:        params.paso,
    nivel:       params.nivel      ?? "info",
    detalle:     params.detalle    ?? null,
    metadata:    params.metadata   ?? {},
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error) console.error("[log-agen] Error registrando:", error.message);
  });
}

export async function listarLogAgen(filtros?: {
  citaId?:  string;
  leadId?:  string;
  nivel?:   NivelLog | "";
  desde?:   string;
}): Promise<EntradaLogAgen[]> {
  const supabase = createServiceClient();
  let q = (supabase as any)
    .from("log_agendamiento")
    .select("id, paso, nivel, detalle, metadata, created_at, cita_id, lead_id, vendedor_id, leads(nombre, telefono), vendedores(nombre)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (filtros?.citaId) q = q.eq("cita_id", filtros.citaId);
  if (filtros?.leadId) q = q.eq("lead_id", filtros.leadId);
  if (filtros?.nivel)  q = q.eq("nivel", filtros.nivel);
  if (filtros?.desde)  q = q.gte("created_at", filtros.desde);

  const { data, error } = await q;
  if (error) throw new Error(`[log-agen] ${(error as { message: string }).message}`);
  return (data ?? []) as EntradaLogAgen[];
}
