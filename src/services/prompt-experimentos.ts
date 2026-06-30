// MPS-16 S64 — Prompt A/B testing. Thompson Sampling para asignar variantes de prompt.
// Las tablas son nuevas (migration 077): todos los accesos usan (supabase as any).

import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { crearRecurso } from "@/services/conocimiento";

// Misma implementación de Thompson Sampling que experimentos.ts (precio A/B)
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
function sampleBeta(a: number, b: number): number {
  const ga = randGamma(a); const gb = randGamma(b);
  return ga + gb === 0 ? 0.5 : ga / (ga + gb);
}
function elegirVariante(exp: { asignaciones_a: number; conversiones_a: number; asignaciones_b: number; conversiones_b: number }): "a" | "b" {
  const tA = sampleBeta(exp.conversiones_a + 1, exp.asignaciones_a - exp.conversiones_a + 1);
  const tB = sampleBeta(exp.conversiones_b + 1, exp.asignaciones_b - exp.conversiones_b + 1);
  return tA >= tB ? "a" : "b";
}

export interface ExperimentoPrompt {
  id: string; nombre: string; descripcion: string | null;
  variante_a: string; variante_b: string;
  segmento: { pipeline_stage?: string; temperamento?: string } | null;
  activo: boolean; ganador: string | null;
  asignaciones_a: number; conversiones_a: number;
  asignaciones_b: number; conversiones_b: number;
  created_at: string;
}

function segmentoMatch(
  seg: ExperimentoPrompt["segmento"],
  ctx: { pipeline_stage: string; temperamento: string | null }
): boolean {
  if (!seg) return true;
  if (seg.pipeline_stage && seg.pipeline_stage !== ctx.pipeline_stage) return false;
  if (seg.temperamento && seg.temperamento !== ctx.temperamento) return false;
  return true;
}

// Obtiene (o crea) la variante asignada al lead para el primer experimento activo
// que matchea el segmento. Devuelve null si no hay experimento activo aplicable.
export async function obtenerVariantePrompt(
  leadId: string,
  ctx: { pipeline_stage: string; temperamento: string | null }
): Promise<{ experimento_id: string; variante: "a" | "b"; texto: string } | null> {
  const db = () => createServiceClient() as any;

  const { data: experimentos } = await db()
    .from("prompt_experimentos")
    .select("*")
    .eq("activo", true)
    .order("created_at");

  const exp = ((experimentos ?? []) as ExperimentoPrompt[]).find((e) => segmentoMatch(e.segmento, ctx));
  if (!exp) return null;

  // Verificar asignación previa
  const { data: asignacionExistente } = await db()
    .from("prompt_asignaciones")
    .select("variante")
    .eq("lead_id", leadId)
    .eq("experimento_id", exp.id)
    .maybeSingle();

  if (asignacionExistente) {
    const v = asignacionExistente.variante as "a" | "b";
    return { experimento_id: exp.id, variante: v, texto: v === "a" ? exp.variante_a : exp.variante_b };
  }

  // Nueva asignación via Thompson Sampling
  const variante = elegirVariante(exp);
  const campo = variante === "a"
    ? { asignaciones_a: exp.asignaciones_a + 1 }
    : { asignaciones_b: exp.asignaciones_b + 1 };

  await Promise.all([
    db().from("prompt_asignaciones").insert({ lead_id: leadId, experimento_id: exp.id, variante }),
    db().from("prompt_experimentos").update(campo).eq("id", exp.id),
  ]);

  const texto = variante === "a" ? exp.variante_a : exp.variante_b;
  void logSistema({
    categoria: "ia", tipoAccion: "prompt_ab.asignar", fase: "ok",
    leadId, resultado: `exp:${exp.id.slice(0, 8)} variante:${variante}`,
  });
  return { experimento_id: exp.id, variante, texto };
}

// Registra conversión en el experimento de prompt del lead (si aplica)
export async function registrarConversionPrompt(leadId: string): Promise<void> {
  const db = () => createServiceClient() as any;
  const { data: asig } = await db()
    .from("prompt_asignaciones")
    .select("id, experimento_id, variante, convertido")
    .eq("lead_id", leadId)
    .eq("convertido", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!asig) return;

  const { data: exp } = await db()
    .from("prompt_experimentos")
    .select("conversiones_a, conversiones_b")
    .eq("id", asig.experimento_id)
    .single();
  if (!exp) return;

  const campo = asig.variante === "a"
    ? { conversiones_a: exp.conversiones_a + 1 }
    : { conversiones_b: exp.conversiones_b + 1 };

  await Promise.all([
    db().from("prompt_asignaciones").update({ convertido: true }).eq("id", asig.id),
    db().from("prompt_experimentos").update(campo).eq("id", asig.experimento_id),
  ]);
}

// Crea un experimento de prompt nuevo
export async function crearExperimentoPrompt(params: {
  nombre: string; descripcion?: string;
  varianteA: string; varianteB: string;
  segmento?: ExperimentoPrompt["segmento"];
}): Promise<void> {
  const db = () => createServiceClient() as any;
  await db().from("prompt_experimentos").insert({
    nombre: params.nombre,
    descripcion: params.descripcion ?? null,
    variante_a: params.varianteA,
    variante_b: params.varianteB,
    segmento: params.segmento ?? null,
  });
}

// Lista todos los experimentos de prompt
export async function listarExperimentosPrompt(): Promise<ExperimentoPrompt[]> {
  const db = () => createServiceClient() as any;
  const { data } = await db()
    .from("prompt_experimentos")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as ExperimentoPrompt[];
}

// Declara el ganador, desactiva el experimento y guarda la variante ganadora en el KB
export async function declararGanadorPrompt(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  const db = () => createServiceClient() as any;
  const { data: exp } = await db()
    .from("prompt_experimentos").select("nombre, variante_a, variante_b").eq("id", experimentoId).single();
  if (!exp) return;

  await db().from("prompt_experimentos").update({ ganador, activo: false }).eq("id", experimentoId);

  const textoGanador = ganador === "a" ? exp.variante_a : exp.variante_b;
  await crearRecurso(
    "practica_venta",
    `[A/B ganador] ${exp.nombre} — variante ${ganador.toUpperCase()}`,
    textoGanador,
    "ia_sugerido",
  );

  void logSistema({
    categoria: "ui", tipoAccion: "prompt_ab.declarar-ganador", fase: "ok",
    resultado: `exp:${experimentoId.slice(0, 8)} ganador:${ganador}`,
  });
}
