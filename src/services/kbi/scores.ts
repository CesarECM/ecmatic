// MPS-20 S74.1 — Motor de scores KBI (Beta-Binomial + decaimiento temporal).
// calcularScoresBatch(): se ejecuta una vez por día desde el cron.
// calcularScoreRespuesta(): se llama en tiempo real al generar cada respuesta.

import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

// Número mínimo de señales 'uso' antes de divergir del prior neutral 0.5.
// Con < MIN_USOS el score se mantiene en 0.5 para no penalizar recursos nuevos.
const MIN_USOS = 5;

// Semivida del decaimiento: tras DECAY_DIAS días sin ningún 'uso', el score
// se reduce a la mitad. Valor 180 días ≈ 6 meses.
const DECAY_DIAS = 180;

// Frases que indican incertidumbre en la respuesta generada.
const FRASES_INCERTIDUMBRE = [
  "no tengo información",
  "no puedo ayudarte",
  "no sé",
  "un asesor",
  "te contactará",
  "fuera de mi alcance",
];

interface AgregadoSenal {
  recurso_id: string;
  total_usos: number;
  total_cierres: number;
  ultimo_uso_at: string | null;
}

// Beta-Binomial con decaimiento exponencial.
// α = cierres+1, β = (usos-cierres)+1 — evita divisiones por cero.
// Multiplica por exp(-días_sin_uso / DECAY_DIAS) para penalizar inactividad.
function calcularKbiScore(agg: AgregadoSenal): number {
  if (agg.total_usos < MIN_USOS) return 0.5;

  const alpha = agg.total_cierres + 1;
  const beta  = Math.max(agg.total_usos - agg.total_cierres, 0) + 1;
  const raw   = alpha / (alpha + beta);

  if (!agg.ultimo_uso_at) return raw;

  const diasSinUso = (Date.now() - new Date(agg.ultimo_uso_at).getTime()) / 86_400_000;
  return Math.max(0, Math.min(1, raw * Math.exp(-diasSinUso / DECAY_DIAS)));
}

// Calcula y persiste kbi_score para todos los recursos con señales.
// Retorna métricas para el log del cron.
export async function calcularScoresBatch(): Promise<{
  actualizados: number;
  errores: number;
  sin_senales: number;
}> {
  const supabase = createServiceClient();
  const traceId  = crypto.randomUUID();

  void logSistema({
    categoria: "cron", tipoAccion: "kbi.scores.batch", fase: "inicio", traceId,
  });

  // Una sola query: agrega todas las señales por recurso
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agregados, error: errAgg } = await (supabase as any)
    .rpc("kbi_agregar_senales") as { data: AgregadoSenal[] | null; error: unknown };

  if (errAgg) {
    void logSistema({
      categoria: "cron", tipoAccion: "kbi.scores.batch", fase: "error", traceId,
      resultado: String(errAgg),
    });
    return { actualizados: 0, errores: 1, sin_senales: 0 };
  }

  if (!agregados?.length) {
    void logSistema({
      categoria: "cron", tipoAccion: "kbi.scores.batch", fase: "ok", traceId,
      resultado: "sin señales acumuladas aún",
    });
    return { actualizados: 0, errores: 0, sin_senales: 0 };
  }

  let actualizados = 0;
  let errores = 0;

  // Procesar en paralelo con límite de concurrencia para no saturar el pool
  const LOTE = 20;
  for (let i = 0; i < agregados.length; i += LOTE) {
    const lote = agregados.slice(i, i + LOTE);
    await Promise.all(lote.map(async (agg) => {
      const kbi_score = calcularKbiScore(agg);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("recursos_conocimiento")
        .update({ kbi_score })
        .eq("id", agg.recurso_id);
      if (error) errores++;
      else actualizados++;
    }));
  }

  void logSistema({
    categoria: "cron", tipoAccion: "kbi.scores.batch", fase: "ok", traceId,
    resultado: `actualizados: ${actualizados}`,
    metadata: { actualizados, errores, total_procesados: agregados.length },
  });

  return { actualizados, errores, sin_senales: 0 };
}

// Calcula el score de confianza de una respuesta individual.
// Combina: kbi_score promedio de los recursos usados + presencia de recursos + penalización.
export async function calcularScoreRespuesta(
  recursoIds: string[],
  textoRespuesta: string,
): Promise<number> {
  if (!recursoIds.length) return 0.20;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createServiceClient() as any)
    .from("recursos_conocimiento")
    .select("kbi_score")
    .in("id", recursoIds) as { data: { kbi_score: number }[] | null };

  const scores = (data ?? []).map((r) => r.kbi_score);
  if (!scores.length) return 0.20;

  const promedioKbi  = scores.reduce((s, v) => s + v, 0) / scores.length;
  const presencia    = Math.min(scores.length / 3, 1);
  const penalizacion = FRASES_INCERTIDUMBRE.some((f) =>
    textoRespuesta.toLowerCase().includes(f)
  ) ? 0.25 : 0;

  return Math.max(0, Math.min(1,
    promedioKbi * 0.70 + presencia * 0.30 - penalizacion
  ));
}
