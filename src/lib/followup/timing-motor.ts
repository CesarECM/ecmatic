// MPS-5 S39.2 — Motor de timing adaptativo.
// Capa 1: backoff exponencial configurable.
// Capa 2: selección bayesiana del slot óptimo dentro de la ventana post-floor.
import { createServiceClient } from "@/lib/supabase/service";
import { getFollowupConfig, type TipoFollowup, type FollowupConfig } from "@/services/followup-config";

// UTC-6 permanente (México no tiene DST desde 2022)
const CDMX_OFFSET_H = -6;

// ── Capa 1: backoff exponencial ──────────────────────────────────────────────

// delay(nivel) = min(base_hours × growth^(nivel-1), cap_hours)  [nivel 1-indexed]
export function calcularDelayMs(nivel: number, config: Pick<FollowupConfig, "base_hours" | "growth" | "cap_hours">): number {
  const horas = Math.min(
    config.base_hours * Math.pow(config.growth, nivel - 1),
    config.cap_hours,
  );
  return Math.round(horas * 3_600_000);
}

// ── Capa 2: timing bayesiano ─────────────────────────────────────────────────

interface SlotRow {
  day_of_week: number;
  hour_of_day: number;
  alpha: number;
  beta: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

async function leerPosteriorLead(leadId: string): Promise<Map<string, SlotRow>> {
  const { data } = await db()
    .from("lead_timing_posterior")
    .select("day_of_week, hour_of_day, alpha, beta")
    .eq("lead_id", leadId) as { data: SlotRow[] | null };
  const map = new Map<string, SlotRow>();
  for (const r of data ?? []) map.set(`${r.day_of_week}:${r.hour_of_day}`, r);
  return map;
}

async function leerPriorGlobal(tipo: TipoFollowup): Promise<Map<string, SlotRow>> {
  const { data } = await db()
    .from("global_timing_prior")
    .select("day_of_week, hour_of_day, alpha, beta")
    .eq("followup_type", tipo) as { data: SlotRow[] | null };
  const map = new Map<string, SlotRow>();
  for (const r of data ?? []) map.set(`${r.day_of_week}:${r.hour_of_day}`, r);
  return map;
}

function toCDMX(date: Date): { dayOfWeek: number; hourOfDay: number } {
  const cdmxMs = date.getTime() + CDMX_OFFSET_H * 3_600_000;
  const d = new Date(cdmxMs);
  return { dayOfWeek: d.getUTCDay(), hourOfDay: d.getUTCHours() };
}

// Genera candidatos de 1h en 1h desde floor hasta windowEnd, filtrando quiet hours
function generarSlots(floor: Date, windowEnd: Date, config: FollowupConfig): Array<{ ts: Date; dow: number; hod: number }> {
  const result: Array<{ ts: Date; dow: number; hod: number }> = [];
  const stepMs = 3_600_000;
  let current = new Date(floor);

  while (current <= windowEnd) {
    const { dayOfWeek, hourOfDay } = toCDMX(current);
    if (hourOfDay >= config.window_start && hourOfDay < config.window_end) {
      result.push({ ts: new Date(current), dow: dayOfWeek, hod: hourOfDay });
    }
    current = new Date(current.getTime() + stepMs);
  }
  return result;
}

// ── Thompson Sampling — muestreo de Beta(α, β) ──────────────────────────────
// Implementación sin dependencias externas.
// Algoritmo: Beta(α,β) = Gamma(α) / (Gamma(α)+Gamma(β))
// Gamma por Marsaglia-Tsang (2000); Normal por Box-Muller.

function normalRandom(): number {
  // Box-Muller — devuelve una muestra N(0,1)
  let u: number, v: number;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(shape: number): number {
  // Marsaglia-Tsang para shape ≥ 1
  if (shape < 1) {
    // Relación: Gamma(k) = Gamma(k+1) × U^(1/k)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normalRandom();
    const v = Math.pow(1 + c * x, 3);
    if (v > 0) {
      const u = Math.random();
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
}

// Thompson Sampling: muestrea un valor de Beta(α, β).
// Con pocos datos la muestra es ruidosa → explora slots desconocidos.
// Con muchos datos converge al slot con mayor tasa real de respuesta → explota.
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(Math.max(alpha, 0.1));
  const y = sampleGamma(Math.max(beta,  0.1));
  const sum = x + y;
  return sum === 0 ? 0.5 : x / sum;
}

// Selecciona score del slot usando Thompson Sampling (no la media α/(α+β))
function scoreSlot(dow: number, hod: number, posterior: Map<string, SlotRow>, prior: Map<string, SlotRow>): number {
  const key = `${dow}:${hod}`;
  const row = posterior.get(key) ?? prior.get(key);
  if (!row) return sampleBeta(2, 3); // neutro con algo de ruido si no hay datos
  return sampleBeta(row.alpha, row.beta);
}

// Desplaza el timestamp al inicio de la ventana del día siguiente si no hay slots válidos
function siguienteVentanaInicio(desde: Date, config: FollowupConfig): Date {
  const cdmxMs = desde.getTime() + CDMX_OFFSET_H * 3_600_000;
  const d = new Date(cdmxMs);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(config.window_start, 0, 0, 0);
  return new Date(d.getTime() - CDMX_OFFSET_H * 3_600_000);
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function calcularProximoAt(params: {
  leadId: string;
  tipo: TipoFollowup;
  nivel: number;  // 1-indexed — el nivel que se va a enviar AHORA (acaba de terminar nivel-1)
}): Promise<Date> {
  const config = await getFollowupConfig(params.tipo);

  // Capa 1: floor
  const floorMs = Date.now() + calcularDelayMs(params.nivel, config);
  const floor = new Date(floorMs);

  // Capa 2: intentar mejorar el timing con el modelo bayesiano
  const windowEnd = new Date(floorMs + config.search_hours * 3_600_000);

  const [posterior, prior] = await Promise.all([
    leerPosteriorLead(params.leadId).catch(() => new Map<string, SlotRow>()),
    leerPriorGlobal(params.tipo).catch(() => new Map<string, SlotRow>()),
  ]);

  const slots = generarSlots(floor, windowEnd, config);

  if (!slots.length) {
    // Fuera de ventana: empujar al inicio del próximo día hábil
    return siguienteVentanaInicio(floor, config);
  }

  let best = slots[0];
  let bestScore = scoreSlot(best.dow, best.hod, posterior, prior);

  for (const slot of slots.slice(1)) {
    const s = scoreSlot(slot.dow, slot.hod, posterior, prior);
    if (s > bestScore) { bestScore = s; best = slot; }
  }

  return best.ts;
}

// Actualiza α o β tras confirmar si hubo respuesta en esa ventana
export async function actualizarPosterior(
  leadId: string,
  dayOfWeek: number,
  hourOfDay: number,
  hubRespuesta: boolean,
): Promise<void> {
  const key = { lead_id: leadId, day_of_week: dayOfWeek, hour_of_day: hourOfDay };

  const { data: existing } = await db()
    .from("lead_timing_posterior")
    .select("id, alpha, beta")
    .match(key)
    .maybeSingle() as { data: { id: string; alpha: number; beta: number } | null };

  if (existing) {
    await db()
      .from("lead_timing_posterior")
      .update(
        hubRespuesta
          ? { alpha: existing.alpha + 1, updated_at: new Date().toISOString() }
          : { beta:  existing.beta  + 1, updated_at: new Date().toISOString() },
      )
      .eq("id", existing.id);
  } else {
    // Primera vez: inicializar desde el prior global (no sabemos el tipo aquí, usamos neutro)
    await db()
      .from("lead_timing_posterior")
      .insert({
        ...key,
        alpha: hubRespuesta ? 2 : 1,
        beta:  hubRespuesta ? 1 : 2,
      });
  }
}
