// MPS-26 S94 — Thompson Sampling sobre global_angle_prior + lead_angle_posterior.
// Mismo algoritmo Beta-Binomial del timing-motor.ts, aplicado a ángulos de reactivación.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

export interface AnguloSeleccionado {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
}

interface AnguloRow {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  nivel_min: number;
  nivel_max: number;
}

interface PriorRow {
  angulo_id: string;
  alpha: number;
  beta: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// ── Thompson Sampling (mismo algoritmo que timing-motor.ts) ──────────────────

function normalRandom(): number {
  let u: number, v: number;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(shape: number): number {
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
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

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(Math.max(alpha, 0.1));
  const y = sampleGamma(Math.max(beta, 0.1));
  const sum = x + y;
  return sum === 0 ? 0.5 : x / sum;
}

// ── Lectura de priors / posteriors ───────────────────────────────────────────

async function leerPriorGlobalAngulos(
  tipo: string,
): Promise<Map<string, PriorRow>> {
  const { data } = await db()
    .from("global_angle_prior")
    .select("angulo_id, alpha, beta")
    .eq("tipo", tipo) as { data: PriorRow[] | null };
  const map = new Map<string, PriorRow>();
  for (const r of data ?? []) map.set(r.angulo_id, r);
  return map;
}

async function leerPosteriorLeadAngulos(
  leadId: string,
): Promise<Map<string, PriorRow>> {
  const { data } = await db()
    .from("lead_angle_posterior")
    .select("angulo_id, alpha, beta")
    .eq("lead_id", leadId) as { data: PriorRow[] | null };
  const map = new Map<string, PriorRow>();
  for (const r of data ?? []) map.set(r.angulo_id, r);
  return map;
}

// ── Selección principal ───────────────────────────────────────────────────────

export async function seleccionarAngulo(params: {
  tipo: string;
  nivel: number;
  leadId: string;
  angulosYaUsados?: string[];  // códigos ya usados con este lead en este ciclo
}): Promise<AnguloSeleccionado | null> {
  const { tipo, nivel, leadId, angulosYaUsados = [] } = params;

  // 1. Candidatos: ángulos activos que aplican al tipo y al nivel actual
  const { data: candidatos } = await db()
    .from("followup_angulos")
    .select("id, codigo, nombre, descripcion, nivel_min, nivel_max")
    .eq("activo", true)
    .or(`tipo.is.null,tipo.eq.${tipo}`)
    .lte("nivel_min", nivel)
    .gte("nivel_max", nivel) as { data: AnguloRow[] | null };

  if (!candidatos?.length) return null;

  // Excluir ángulos ya usados con este lead en el mismo ciclo
  const disponibles = candidatos.filter(
    (a) => !angulosYaUsados.includes(a.codigo),
  );

  if (!disponibles.length) {
    // Todos usados: reutilizar el de mayor score (explore-exploit finaliza en exploit)
    disponibles.push(...candidatos);
  }

  // 2. Leer priors y posterior del lead
  const [prior, posterior] = await Promise.all([
    leerPriorGlobalAngulos(tipo).catch(() => new Map<string, PriorRow>()),
    leerPosteriorLeadAngulos(leadId).catch(() => new Map<string, PriorRow>()),
  ]);

  // 3. Thompson Sampling: muestrear Beta(α, β) por ángulo y elegir el mayor
  let mejor = disponibles[0];
  let mejorScore = -1;

  for (const angulo of disponibles) {
    // Posterior del lead tiene prioridad; si no, usar el prior global
    const row = posterior.get(angulo.id) ?? prior.get(angulo.id);
    const score = row
      ? sampleBeta(row.alpha, row.beta)
      : sampleBeta(2, 3); // neutro con ruido si sin datos
    if (score > mejorScore) {
      mejorScore = score;
      mejor = angulo;
    }
  }

  void logSistema({
    categoria: "ia",
    tipoAccion: "seguimiento.angulo.seleccionado",
    fase: "ok",
    leadId,
    resultado: `${mejor.codigo} (score≈${mejorScore.toFixed(3)})`,
    metadata: { tipo, nivel, candidatos: disponibles.length, angulosYaUsados },
  });

  return { id: mejor.id, codigo: mejor.codigo, nombre: mejor.nombre, descripcion: mejor.descripcion };
}

// ── Actualizar posterior tras observar respuesta ──────────────────────────────
// Llamar desde followup-learning cuando cierra la ventana de 24h.

export async function actualizarPosteriorAngulo(
  leadId: string,
  anguloId: string,
  huboRespuesta: boolean,
): Promise<void> {
  const existente = await db()
    .from("lead_angle_posterior")
    .select("id, alpha, beta")
    .eq("lead_id", leadId)
    .eq("angulo_id", anguloId)
    .maybeSingle() as { data: { id: string; alpha: number; beta: number } | null };

  if (existente.data) {
    await db()
      .from("lead_angle_posterior")
      .update(
        huboRespuesta
          ? { alpha: existente.data.alpha + 1, updated_at: new Date().toISOString() }
          : { beta:  existente.data.beta  + 1, updated_at: new Date().toISOString() },
      )
      .eq("id", existente.data.id);
  } else {
    await db()
      .from("lead_angle_posterior")
      .insert({
        lead_id:  leadId,
        angulo_id: anguloId,
        alpha: huboRespuesta ? 2 : 1,
        beta:  huboRespuesta ? 1 : 2,
      });
  }
}
