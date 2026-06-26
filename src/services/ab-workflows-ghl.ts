import { createServiceClient } from "@/lib/supabase/service";

// Beta sampling — mismo algoritmo que pipeline-ab.ts (Thompson Sampling)
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randGamma(shape: number): number {
  if (shape < 1) return randGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = randn(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const a = randGamma(alpha);
  const b = randGamma(beta);
  return a + b === 0 ? 0.5 : a / (a + b);
}

export async function elegirVarianteWorkflow(campana: string): Promise<"a" | "b"> {
  const supabase = createServiceClient();

  const { data } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("variante, convirtio")
    .eq("campana", campana)
    .not("variante", "is", null) as {
      data: { variante: "a" | "b"; convirtio: boolean | null }[] | null;
    };

  const rows = data ?? [];
  const enviadosA     = rows.filter((r) => r.variante === "a").length;
  const enviadosB     = rows.filter((r) => r.variante === "b").length;
  const convertidosA  = rows.filter((r) => r.variante === "a" && r.convirtio === true).length;
  const convertidosB  = rows.filter((r) => r.variante === "b" && r.convirtio === true).length;

  const thetaA = sampleBeta(convertidosA + 1, enviadosA - convertidosA + 1);
  const thetaB = sampleBeta(convertidosB + 1, enviadosB - convertidosB + 1);
  return thetaA >= thetaB ? "a" : "b";
}

export async function registrarConversionGHL(
  ghlContactId: string,
  campana: string
): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_campana_logs")
    .update({ convirtio: true, respuesta_tipo: "positivo", respuesta_at: new Date().toISOString() })
    .eq("ghl_contact_id", ghlContactId)
    .eq("campana", campana);
}

export async function registrarRespuestaGHL(
  ghlContactId: string,
  campana: string,
  tipo: "positivo" | "negativo" | "neutro"
): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("ghl_campana_logs")
    .update({
      respuesta_tipo: tipo,
      respuesta_at:   new Date().toISOString(),
      convirtio:      tipo === "positivo" ? true : (tipo === "negativo" ? false : null),
    })
    .eq("ghl_contact_id", ghlContactId)
    .eq("campana", campana);
}

export interface StatsAB {
  campana: string;
  total_enviados:    number;
  enviados_a:        number;
  enviados_b:        number;
  convertidos_a:     number;
  convertidos_b:     number;
  tasa_a:            number;
  tasa_b:            number;
  total_negativos:   number;
  sin_respuesta:     number;
}

export async function obtenerStatsAB(campana: string): Promise<StatsAB> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("variante, convirtio, respuesta_tipo, enviado")
    .eq("campana", campana) as {
      data: { variante: "a" | "b" | null; convirtio: boolean | null; respuesta_tipo: string | null; enviado: boolean }[] | null;
    };

  const rows = data ?? [];
  const enviados    = rows.filter((r) => r.enviado);
  const enviadosA   = enviados.filter((r) => r.variante === "a");
  const enviadosB   = enviados.filter((r) => r.variante === "b");
  const convA       = enviadosA.filter((r) => r.convirtio === true).length;
  const convB       = enviadosB.filter((r) => r.convirtio === true).length;

  return {
    campana,
    total_enviados:  enviados.length,
    enviados_a:      enviadosA.length,
    enviados_b:      enviadosB.length,
    convertidos_a:   convA,
    convertidos_b:   convB,
    tasa_a:          enviadosA.length > 0 ? convA / enviadosA.length : 0,
    tasa_b:          enviadosB.length > 0 ? convB / enviadosB.length : 0,
    total_negativos: rows.filter((r) => r.respuesta_tipo === "negativo").length,
    sin_respuesta:   enviados.filter((r) => r.respuesta_tipo === null).length,
  };
}
