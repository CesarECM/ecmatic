// S30.3 — Contextual Bandit para next-best-action
// Extiende Thompson Sampling incorporando contexto del lead
// (fase CAGC, avatar, canal) en la decisión de variante.
// Los contadores alpha/beta se mantienen por (test_id, context_key) en BD.

import { createServiceClient } from "@/lib/supabase/service";

// ── Reutilizamos las funciones de sampling de pipeline-ab.ts ──────────────
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function randGamma(shape: number): number {
  if (shape < 1) return randGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = randn(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(alpha: number, beta: number): number {
  const a = randGamma(alpha); const b = randGamma(beta);
  return a + b === 0 ? 0.5 : a / (a + b);
}

// ── Context key: identifica el "brazo" contextualizado ───────────────────
// Combina fase CAGC (bucketed), avatar y canal para crear un contexto discreto.
function buildContextKey(params: {
  faseCAGC: number;
  avatarTipo: string | null;
  canal: string;
}): string {
  // Bucketing de fases: 0-4 (descubrimiento), 5-8 (evaluación), 9-10 (decisión), 11-16 (post)
  const faseBucket =
    params.faseCAGC <= 4 ? "desc" :
    params.faseCAGC <= 8 ? "eval" :
    params.faseCAGC <= 10 ? "dec" : "post";

  const avatar = params.avatarTipo ?? "generico";
  const canal = ["whatsapp", "ghl"].includes(params.canal) ? "directo" : "otro";

  return `${faseBucket}:${avatar}:${canal}`;
}

interface ContextoContadores {
  test_id: string;
  context_key: string;
  asignaciones_a: number; conversiones_a: number;
  asignaciones_b: number; conversiones_b: number;
}

// S30.3 — Elige la variante para un lead usando su contexto.
// Si no hay datos de contexto suficientes, cae back a global (sin contexto).
export async function elegirVarianteContextual(
  testId: string,
  leadId: string
): Promise<"a" | "b"> {
  const supabase = createServiceClient();

  // Obtener contexto del lead
  const { data: lead } = await supabase
    .from("leads")
    .select("canal_origen")
    .eq("id", leadId)
    .maybeSingle();

  const { data: cagcEstado } = await supabase
    .from("lead_cagc_estado")
    .select("fase_numero")
    .eq("lead_id", leadId)
    .maybeSingle();

  const { data: avatar } = await supabase
    .from("leads")
    .select("avatares(tipo)")
    .eq("id", leadId)
    .maybeSingle();

  const contextKey = buildContextKey({
    faseCAGC: cagcEstado?.fase_numero ?? 0,
    avatarTipo: (avatar as any)?.avatares?.tipo ?? null,
    canal: lead?.canal_origen ?? "whatsapp",
  });

  // Buscar o crear contadores para este contexto
  const { data: ctx } = await (supabase as any)
    .from("pipeline_ab_contextos")
    .select("*")
    .eq("test_id", testId)
    .eq("context_key", contextKey)
    .maybeSingle() as { data: ContextoContadores | null };

  if (!ctx || (ctx.asignaciones_a + ctx.asignaciones_b) < 5) {
    // Datos insuficientes en este contexto — usar contadores globales del test
    const { data: test } = await (supabase as any)
      .from("pipeline_ab_tests")
      .select("asignaciones_a, asignaciones_b, conversiones_a, conversiones_b")
      .eq("id", testId)
      .maybeSingle();

    if (!test) return Math.random() < 0.5 ? "a" : "b";

    const thetaA = sampleBeta(test.conversiones_a + 1, test.asignaciones_a - test.conversiones_a + 1);
    const thetaB = sampleBeta(test.conversiones_b + 1, test.asignaciones_b - test.conversiones_b + 1);
    return thetaA >= thetaB ? "a" : "b";
  }

  // Enough context data — use context-specific Thompson Sampling
  const thetaA = sampleBeta(ctx.conversiones_a + 1, ctx.asignaciones_a - ctx.conversiones_a + 1);
  const thetaB = sampleBeta(ctx.conversiones_b + 1, ctx.asignaciones_b - ctx.conversiones_b + 1);
  return thetaA >= thetaB ? "a" : "b";
}

// S30.3 — Registra el resultado de una asignación contextual (conversión o no)
export async function registrarResultadoContextual(
  testId: string,
  contextKey: string,
  variante: "a" | "b",
  convirtio: boolean
): Promise<void> {
  const supabase = createServiceClient();

  const { data: existing } = await (supabase as any)
    .from("pipeline_ab_contextos")
    .select("id, asignaciones_a, asignaciones_b, conversiones_a, conversiones_b")
    .eq("test_id", testId)
    .eq("context_key", contextKey)
    .maybeSingle() as { data: (ContextoContadores & { id: string }) | null };

  if (existing) {
    const update: Partial<ContextoContadores> = {};
    if (variante === "a") {
      update.asignaciones_a = existing.asignaciones_a + 1;
      if (convirtio) update.conversiones_a = existing.conversiones_a + 1;
    } else {
      update.asignaciones_b = existing.asignaciones_b + 1;
      if (convirtio) update.conversiones_b = existing.conversiones_b + 1;
    }
    await (supabase as any).from("pipeline_ab_contextos").update(update).eq("id", existing.id);
  } else {
    await (supabase as any).from("pipeline_ab_contextos").insert({
      test_id: testId, context_key: contextKey,
      asignaciones_a: variante === "a" ? 1 : 0,
      asignaciones_b: variante === "b" ? 1 : 0,
      conversiones_a: variante === "a" && convirtio ? 1 : 0,
      conversiones_b: variante === "b" && convirtio ? 1 : 0,
    });
  }
}

export { buildContextKey };
