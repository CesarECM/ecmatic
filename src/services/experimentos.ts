import { createServiceClient } from "@/lib/supabase/service";

// S30.4 — Beta sampling para Thompson Sampling (misma implementación que pipeline-ab)
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
function elegirGrupoThompson(exp: Experimento): "a" | "b" {
  const thetaA = sampleBeta(exp.conversiones_a + 1, exp.asignaciones_a - exp.conversiones_a + 1);
  const thetaB = sampleBeta(exp.conversiones_b + 1, exp.asignaciones_b - exp.conversiones_b + 1);
  return thetaA >= thetaB ? "a" : "b";
}

export interface Experimento {
  id: string; nombre: string; descripcion: string | null;
  precio_a_centavos: number; precio_b_centavos: number;
  segmento_a: string; segmento_b: string; activo: boolean;
  ganador: "a" | "b" | null;
  conversiones_a: number; conversiones_b: number;
  asignaciones_a: number; asignaciones_b: number;
}

// S11.4 — Lista experimentos de precio
export async function listarExperimentos(): Promise<Experimento[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("experimentos_precios").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`[experimentos] ${error.message}`);
  return (data ?? []) as Experimento[];
}

// S11.4 — Crea un nuevo experimento de precio
export async function crearExperimento(params: {
  nombre: string; descripcion?: string;
  precioACentavos: number; precioBCentavos: number;
  segmentoA: string; segmentoB: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("experimentos_precios").insert({
    nombre: params.nombre,
    descripcion: params.descripcion ?? null,
    precio_a_centavos: params.precioACentavos,
    precio_b_centavos: params.precioBCentavos,
    segmento_a: params.segmentoA,
    segmento_b: params.segmentoB,
  });
}

// S11.4 — Asigna un lead a un grupo del experimento activo y devuelve el precio
export async function asignarExperimento(leadId: string): Promise<{
  experimentoId: string; grupo: "a" | "b"; precioCentavos: number;
} | null> {
  const supabase = createServiceClient();

  const { data: exp } = await supabase
    .from("experimentos_precios").select("*").eq("activo", true).limit(1).maybeSingle();
  if (!exp) return null;

  // Verificar si ya fue asignado
  const { data: lead } = await supabase
    .from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata ?? {}) as Record<string, unknown>;
  if (meta.experimento_id === exp.id) {
    return {
      experimentoId: exp.id,
      grupo: meta.experimento_grupo as "a" | "b",
      precioCentavos: meta.experimento_grupo === "a" ? exp.precio_a_centavos : exp.precio_b_centavos,
    };
  }

  // S30.4 — Thompson Sampling para precio: favorece el precio con mayor conversión histórica
  const grupo: "a" | "b" = elegirGrupoThompson(exp);
  const precioCentavos = grupo === "a" ? exp.precio_a_centavos : exp.precio_b_centavos;
  const campo = grupo === "a" ? { asignaciones_a: exp.asignaciones_a + 1 } : { asignaciones_b: exp.asignaciones_b + 1 };

  await Promise.all([
    supabase.from("experimentos_precios").update(campo).eq("id", exp.id),
    supabase.from("leads").update({
      metadata: { ...meta, experimento_id: exp.id, experimento_grupo: grupo },
    }).eq("id", leadId),
  ]);

  return { experimentoId: exp.id, grupo, precioCentavos };
}

// S11.4 — Registra conversión en el experimento
export async function registrarConversionExperimento(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata ?? {}) as Record<string, unknown>;
  const expId = meta.experimento_id as string | undefined;
  const grupo = meta.experimento_grupo as "a" | "b" | undefined;
  if (!expId || !grupo) return;

  const { data: exp } = await supabase
    .from("experimentos_precios").select("conversiones_a, conversiones_b").eq("id", expId).single();
  if (!exp) return;

  const campo = grupo === "a"
    ? { conversiones_a: exp.conversiones_a + 1 }
    : { conversiones_b: exp.conversiones_b + 1 };
  await supabase.from("experimentos_precios").update(campo).eq("id", expId);
}

// S11.4 — Declara el ganador y desactiva el experimento
export async function declararGanador(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("experimentos_precios")
    .update({ ganador, activo: false }).eq("id", experimentoId);
}
