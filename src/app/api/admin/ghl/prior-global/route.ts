// MPS-16 S59 — Cron semanal (lunes 06:00 CDMX): consolida lead_timing_posterior → global_timing_prior.
// Cada lead nuevo arranca con el aprendizaje de todos los anteriores en lugar de un prior neutro.
//
// Algoritmo:
// 1. Lee posteriors de los últimos 30 días.
// 2. Agrupa por (day_of_week, hour_of_day); calcula media ponderada de α y β.
//    Peso recencia: registros < 7 días pesan 2×, el resto 1×.
// 3. Hace upsert en global_timing_prior para los 4 tipos de followup.
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { createServiceClient } from "@/lib/supabase/service";

const CRON_SECRET = process.env.CRON_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

const FOLLOWUP_TYPES = ["nurturing", "conversational", "payment", "demo_agendado"] as const;

interface PosteriorRow {
  day_of_week: number;
  hour_of_day: number;
  alpha: number;
  beta: number;
  updated_at: string;
}

interface SlotAgregado {
  alphaPond: number;
  betaPond:  number;
  pesoTotal: number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.prior-global", fase: "inicio", traceId,
    resultado: "Consolidando lead_timing_posterior → global_timing_prior",
  });

  try {
    const hace30dias = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
    const hace7dias  = new Date(Date.now() -  7 * 24 * 3_600_000).toISOString();

    const { data: posteriors, error } = await db()
      .from("lead_timing_posterior")
      .select("day_of_week, hour_of_day, alpha, beta, updated_at")
      .gte("updated_at", hace30dias) as { data: PosteriorRow[] | null; error: unknown };

    if (error) throw new Error(String(error));
    if (!posteriors?.length) {
      void logSistema({
        categoria: "cron", tipoAccion: "cron.prior-global", fase: "ok", traceId,
        resultado: "Sin datos en últimos 30 días — prior global sin cambios",
      });
      return NextResponse.json({ ok: true, slots_actualizados: 0, duracion_ms: Date.now() - inicio });
    }

    // Agrupar por slot y calcular media ponderada de α/β
    const agregados = new Map<string, SlotAgregado>();

    for (const row of posteriors) {
      const key = `${row.day_of_week}:${row.hour_of_day}`;
      // Peso recencia: < 7 días = 2, resto = 1
      const peso = row.updated_at >= hace7dias ? 2 : 1;

      const entry = agregados.get(key) ?? { alphaPond: 0, betaPond: 0, pesoTotal: 0 };
      entry.alphaPond += row.alpha * peso;
      entry.betaPond  += row.beta  * peso;
      entry.pesoTotal += peso;
      agregados.set(key, entry);
    }

    let slotsActualizados = 0;

    for (const [key, agg] of agregados.entries()) {
      const [dow, hod] = key.split(":").map(Number);
      const alphaFinal = parseFloat((agg.alphaPond / agg.pesoTotal).toFixed(4));
      const betaFinal  = parseFloat((agg.betaPond  / agg.pesoTotal).toFixed(4));

      // Actualizar el prior para los 4 tipos de followup con los mismos valores consolidados.
      // El posterior no segmenta por tipo (actualizarPosterior no conoce el tipo), así que
      // el aprendizaje de timing aplica igual a todos los tipos.
      for (const tipo of FOLLOWUP_TYPES) {
        await db()
          .from("global_timing_prior")
          .upsert(
            { day_of_week: dow, hour_of_day: hod, followup_type: tipo, alpha: alphaFinal, beta: betaFinal },
            { onConflict: "day_of_week,hour_of_day,followup_type" }
          );
      }

      slotsActualizados++;
    }

    const resultado = { posteriors_leidos: posteriors.length, slots_actualizados: slotsActualizados, duracion_ms: Date.now() - inicio };

    void logSistema({
      categoria: "cron", tipoAccion: "cron.prior-global", fase: "ok", traceId,
      resultado: JSON.stringify(resultado), metadata: resultado,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.prior-global", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
