import { createServiceClient } from "@/lib/supabase/service";

// Benchmarks de conversión por etapa (industria educación/certificación B2C México)
const BENCHMARKS: Record<string, number> = {
  "Nuevo":           0.70,
  "Contactado":      0.40,
  "Primer contacto": 0.60,
  "Interesado":      0.35,
  "Diagnóstico":     0.45,
  "Propuesta":       0.50,
  "Seguimiento":     0.40,
  "Negociación":     0.30,
  "Decisión":        0.35,
};

const UMBRAL_DIFERENCIA    = 0.10;
const DIAS_ESPERA_BENCHMARK = 30;

interface AbTest {
  id: string;
  nombre: string;
  ruta: string;
  etapa_nombre: string;
  variante_a_recurso_id: string | null;
  variante_b_recurso_id: string | null;
  asignaciones_a: number;
  asignaciones_b: number;
  conversiones_a: number;
  conversiones_b: number;
  activo: boolean;
  ganador: "a" | "b" | "benchmark" | null;
  min_muestra: number;
  created_at: string;
}

interface AbAsignacion {
  id: string;
  test_id: string;
  lead_id: string;
  variante: "a" | "b";
  convirtio: boolean | null;
}

// ── S13.8: Asigna variante A o B cuando un lead ENTRA a una etapa ─────────
export async function asignarVarianteAB(
  leadId: string,
  etapaNombre: string,
  ruta: string
): Promise<void> {
  const supabase = createServiceClient();

  const { data: test } = await (supabase as any)
    .from("pipeline_ab_tests")
    .select("id, asignaciones_a, asignaciones_b")
    .eq("etapa_nombre", etapaNombre)
    .eq("ruta", ruta)
    .eq("activo", true)
    .maybeSingle() as { data: Pick<AbTest, "id" | "asignaciones_a" | "asignaciones_b"> | null };

  if (!test) return;

  const { data: existente } = await (supabase as any)
    .from("pipeline_ab_asignaciones")
    .select("id")
    .eq("test_id", test.id)
    .eq("lead_id", leadId)
    .maybeSingle() as { data: { id: string } | null };

  if (existente) return;

  const variante: "a" | "b" =
    test.asignaciones_a <= test.asignaciones_b ? "a" : "b";
  const campo =
    variante === "a"
      ? { asignaciones_a: test.asignaciones_a + 1 }
      : { asignaciones_b: test.asignaciones_b + 1 };

  await Promise.all([
    (supabase as any)
      .from("pipeline_ab_asignaciones")
      .insert({ test_id: test.id, lead_id: leadId, variante, convirtio: null }),
    (supabase as any).from("pipeline_ab_tests").update(campo).eq("id", test.id),
  ]);
}

// ── S13.8: Registra conversión cuando un lead AVANZA desde una etapa ──────
export async function registrarAvanceAB(
  leadId: string,
  etapaNombre: string,
  ruta: string
): Promise<void> {
  if (!etapaNombre) return;
  const supabase = createServiceClient();

  const { data: test } = await (supabase as any)
    .from("pipeline_ab_tests")
    .select("id, conversiones_a, conversiones_b")
    .eq("etapa_nombre", etapaNombre)
    .eq("ruta", ruta)
    .eq("activo", true)
    .maybeSingle() as { data: Pick<AbTest, "id" | "conversiones_a" | "conversiones_b"> | null };

  if (!test) return;

  const { data: asignacion } = await (supabase as any)
    .from("pipeline_ab_asignaciones")
    .select("id, variante")
    .eq("test_id", test.id)
    .eq("lead_id", leadId)
    .is("convirtio", null)
    .maybeSingle() as { data: Pick<AbAsignacion, "id" | "variante"> | null };

  if (!asignacion) return;

  const campoConv =
    asignacion.variante === "a"
      ? { conversiones_a: test.conversiones_a + 1 }
      : { conversiones_b: test.conversiones_b + 1 };

  await Promise.all([
    (supabase as any)
      .from("pipeline_ab_asignaciones")
      .update({ convirtio: true })
      .eq("id", asignacion.id),
    (supabase as any).from("pipeline_ab_tests").update(campoConv).eq("id", test.id),
  ]);
}

// ── S13.8: Cron — evalúa tests activos, declara ganadores o aplica benchmark
export async function evaluarTestsAB(): Promise<{
  evaluados: number;
  ganadoresDeclarados: number;
  benchmarksAplicados: number;
}> {
  const supabase = createServiceClient();

  const { data: tests } = await (supabase as any)
    .from("pipeline_ab_tests")
    .select("*")
    .eq("activo", true) as { data: AbTest[] | null };

  if (!tests?.length) return { evaluados: 0, ganadoresDeclarados: 0, benchmarksAplicados: 0 };

  let ganadoresDeclarados = 0;
  let benchmarksAplicados = 0;

  for (const test of tests) {
    const conVolumen =
      test.asignaciones_a >= test.min_muestra &&
      test.asignaciones_b >= test.min_muestra;

    if (conVolumen) {
      const tasaA = test.asignaciones_a > 0 ? test.conversiones_a / test.asignaciones_a : 0;
      const tasaB = test.asignaciones_b > 0 ? test.conversiones_b / test.asignaciones_b : 0;

      if (Math.abs(tasaA - tasaB) >= UMBRAL_DIFERENCIA) {
        const ganador: "a" | "b" = tasaA >= tasaB ? "a" : "b";
        await declararGanador(test, ganador, tasaA, tasaB);
        ganadoresDeclarados++;
      }
    } else {
      const dias = Math.floor(
        (Date.now() - new Date(test.created_at).getTime()) / 86_400_000
      );
      if (dias >= DIAS_ESPERA_BENCHMARK) {
        await aplicarBenchmark(test);
        benchmarksAplicados++;
      }
    }
  }

  return { evaluados: tests.length, ganadoresDeclarados, benchmarksAplicados };
}

// ── Internos ───────────────────────────────────────────────────────────────

async function declararGanador(
  test: AbTest,
  ganador: "a" | "b",
  tasaA: number,
  tasaB: number
): Promise<void> {
  const supabase = createServiceClient();

  await (supabase as any)
    .from("pipeline_ab_tests")
    .update({ ganador, activo: false })
    .eq("id", test.id);

  const recursoId =
    ganador === "a" ? test.variante_a_recurso_id : test.variante_b_recurso_id;

  if (recursoId) {
    const { data: recurso } = await supabase
      .from("recursos_conocimiento")
      .select("score_efectividad")
      .eq("id", recursoId)
      .maybeSingle();

    if (recurso) {
      await supabase
        .from("recursos_conocimiento")
        .update({ score_efectividad: Math.min(1, (recurso.score_efectividad ?? 0.5) + 0.1) })
        .eq("id", recursoId);
    }
  }

  const tasaGan = ((ganador === "a" ? tasaA : tasaB) * 100).toFixed(1);
  const tasaPer = ((ganador === "a" ? tasaB : tasaA) * 100).toFixed(1);

  await supabase.from("sugerencias_ia").insert({
    tipo: "pipeline",
    titulo: `Test A/B resuelto — ${test.nombre}`,
    descripcion: `Variante ${ganador.toUpperCase()} ganó en etapa "${test.etapa_nombre}" (${tasaGan}% vs ${tasaPer}% conversión). Considera aplicar el enfoque ganador como estándar.`,
    prioridad: "importante",
    aprobado: null,
  });
}

async function aplicarBenchmark(test: AbTest): Promise<void> {
  const supabase = createServiceClient();
  const benchmarkTasa = BENCHMARKS[test.etapa_nombre] ?? 0.40;

  await (supabase as any)
    .from("pipeline_ab_tests")
    .update({ ganador: "benchmark", activo: false, benchmark_tasa: benchmarkTasa })
    .eq("id", test.id);

  await supabase.from("sugerencias_ia").insert({
    tipo: "pipeline",
    titulo: `Test A/B sin volumen — ${test.nombre}`,
    descripcion: `La etapa "${test.etapa_nombre}" no alcanzó muestra mínima (${test.min_muestra} por variante) en ${DIAS_ESPERA_BENCHMARK} días. Benchmark de industria aplicado: ${(benchmarkTasa * 100).toFixed(0)}% de tasa de avance esperada.`,
    prioridad: "puede_esperar",
    aprobado: null,
  });
}
