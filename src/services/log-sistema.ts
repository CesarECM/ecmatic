import { createServiceClient } from "@/lib/supabase/service";

export type Categoria = "ia" | "cron" | "webhook" | "servicio" | "ui" | "auth";
export type FaseSistema =
  | "inicio" | "ok" | "error" | "warn" | "debug"
  | "llamado" | "peticion" | "respuesta" | "timeout";

export interface LogSistemaRow {
  id: string;
  created_at: string;
  categoria: Categoria;
  tipo_accion: string;
  fase: FaseSistema | null;
  trace_id: string | null;
  lead_id: string | null;
  resultado: string | null;
  metadata: Record<string, unknown>;
  leads?: { nombre: string | null; telefono: string | null } | null;
}

export interface EventoLog {
  traceId: string;
  categoria: Categoria;
  tipo_accion: string;
  timestamp: string;
  logs: LogSistemaRow[];
  sinTrace: boolean;
}

export async function logSistema(params: {
  categoria: Categoria;
  tipoAccion: string;
  fase?: FaseSistema;
  traceId?: string | null;
  leadId?: string | null;
  resultado?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const { error } = await supabase.from("log_sistema").insert({
      categoria:   params.categoria,
      tipo_accion: params.tipoAccion,
      fase:        params.fase ?? null,
      trace_id:    params.traceId ?? null,
      lead_id:     params.leadId ?? null,
      resultado:   params.resultado?.slice(0, 400) ?? null,
      metadata:    params.metadata ?? {},
    });
    if (error) console.error("[log-sistema]", error.message);
  } catch (err) {
    console.error("[log-sistema catch]", err);
  }
}

export async function listarLogSistema(filtros?: {
  categoria?: string;
  tipoAccion?: string;
  fase?: string;
  desde?: string;
  hasta?: string;
  leadId?: string;
  limit?: number;
}): Promise<LogSistemaRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  let q = supabase
    .from("log_sistema")
    .select("id, created_at, categoria, tipo_accion, fase, trace_id, lead_id, resultado, metadata, leads(nombre, telefono)")
    .order("created_at", { ascending: false })
    .limit(filtros?.limit ?? 600);

  if (filtros?.categoria)  q = q.eq("categoria",   filtros.categoria);
  if (filtros?.tipoAccion) q = q.eq("tipo_accion",  filtros.tipoAccion);
  if (filtros?.fase)       q = q.eq("fase",         filtros.fase);
  if (filtros?.desde)      q = q.gte("created_at",  filtros.desde);
  if (filtros?.hasta)      q = q.lte("created_at",  filtros.hasta);
  if (filtros?.leadId)     q = q.eq("lead_id",      filtros.leadId);

  const { data, error } = await q;
  if (error) throw new Error(`[log-sistema] ${error.message}`);
  return (data ?? []) as unknown as LogSistemaRow[];
}

export function agruparEventos(registros: LogSistemaRow[]): {
  eventos: EventoLog[];
  legacy: LogSistemaRow[];
} {
  const legacy: LogSistemaRow[] = [];
  const mapa = new Map<string, LogSistemaRow[]>();

  for (const r of registros) {
    if (!r.trace_id) { legacy.push(r); continue; }
    const arr = mapa.get(r.trace_id) ?? [];
    arr.push(r);
    mapa.set(r.trace_id, arr);
  }

  const by = (a: LogSistemaRow, b: LogSistemaRow) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const eventos: EventoLog[] = [];
  for (const [traceId, logs] of mapa) {
    const sorted = [...logs].sort(by);
    const first  = sorted[0];
    eventos.push({
      traceId,
      categoria:   first.categoria,
      tipo_accion: first.tipo_accion,
      timestamp:   first.created_at,
      logs:        sorted,
      sinTrace:    false,
    });
  }

  eventos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { eventos, legacy };
}
