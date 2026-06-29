// MPS-5 S39.2 — Lee la configuración de backoff del motor de seguimiento desde BD.
// Fallback a defaults si la tabla no existe o la fila falta.
import { createServiceClient } from "@/lib/supabase/service";

export type TipoFollowup = "nurturing" | "conversational" | "payment" | "demo_agendado";

export interface FollowupConfig {
  tipo:         TipoFollowup;
  base_hours:   number;
  growth:       number;
  cap_hours:    number;
  max_intentos: number;
  window_start: number;  // hora CDMX inclusiva (ej. 9)
  window_end:   number;  // hora CDMX exclusiva (ej. 22)
  search_hours: number;  // horas de ventana bayesiana post-floor
}

const DEFAULTS: Record<TipoFollowup, FollowupConfig> = {
  nurturing:      { tipo: "nurturing",      base_hours: 4,  growth: 1.7, cap_hours: 96, max_intentos: 6, window_start: 9, window_end: 22, search_hours: 12 },
  conversational: { tipo: "conversational", base_hours: 3,  growth: 1.5, cap_hours: 48, max_intentos: 5, window_start: 9, window_end: 22, search_hours: 12 },
  payment:        { tipo: "payment",        base_hours: 1,  growth: 1.4, cap_hours: 24, max_intentos: 4, window_start: 9, window_end: 22, search_hours:  8 },
  demo_agendado:  { tipo: "demo_agendado",  base_hours: 2,  growth: 1.5, cap_hours: 48, max_intentos: 3, window_start: 9, window_end: 22, search_hours: 12 },
};

// Cache en memoria por invocación serverless (se descarta al terminar la función)
let _cache: Record<string, FollowupConfig> | null = null;

async function cargarCache(): Promise<void> {
  if (_cache) return;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("followup_config").select("*") as { data: FollowupConfig[] | null };
  _cache = { ...DEFAULTS };
  for (const row of data ?? []) _cache[row.tipo] = row;
}

export async function getFollowupConfig(tipo: TipoFollowup): Promise<FollowupConfig> {
  await cargarCache();
  return _cache![tipo] ?? DEFAULTS[tipo];
}

export async function getAllFollowupConfigs(): Promise<FollowupConfig[]> {
  await cargarCache();
  return Object.values(_cache!);
}

export function resetFollowupConfigCache(): void {
  _cache = null;
}
