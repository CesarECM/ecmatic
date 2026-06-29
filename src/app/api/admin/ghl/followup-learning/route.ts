// MPS-5 S41.1 — Cron cada hora: cierra ventanas de aprendizaje bayesiano.
// Para cada intento cuya window_closes_at ya pasó y got_response IS NULL:
// verifica si el lead respondió después del envío → actualiza α o β en lead_timing_posterior.
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { createServiceClient } from "@/lib/supabase/service";
import { actualizarPosterior } from "@/lib/followup/timing-motor";

const CRON_SECRET = process.env.CRON_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

interface IntentoPendiente {
  id: string;
  lead_id: string;
  seguimiento_id: string;
  sent_at: string;
  day_of_week: number;
  hour_of_day: number;
  window_closes_at: string;
}

async function tuvoRespuesta(leadId: string, sentAt: string): Promise<boolean> {
  const { data } = await db()
    .from("mensajes")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direccion", "entrante")
    .gt("created_at", sentAt)
    .limit(1)
    .maybeSingle() as { data: { id: string } | null };
  return data !== null;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.followup-learning", fase: "inicio", traceId,
    resultado: "Actualizando posteriors bayesianos",
  });

  try {
    // Leer intentos cuya ventana ya cerró y aún no tienen resultado
    const { data: intentos, error } = await db()
      .from("followup_attempts_log")
      .select("id, lead_id, seguimiento_id, sent_at, day_of_week, hour_of_day, window_closes_at")
      .is("got_response", null)
      .lte("window_closes_at", new Date().toISOString())
      .order("window_closes_at", { ascending: true })
      .limit(200) as { data: IntentoPendiente[] | null; error: unknown };

    if (error) throw new Error(String(error));
    if (!intentos?.length) {
      return NextResponse.json({ ok: true, procesados: 0, duracion_ms: Date.now() - inicio });
    }

    let actualizados = 0;

    for (const intento of intentos) {
      const respuesta = await tuvoRespuesta(intento.lead_id, intento.sent_at).catch(() => false);

      await actualizarPosterior(
        intento.lead_id,
        intento.day_of_week,
        intento.hour_of_day,
        respuesta,
      ).catch((e) => void logSistema({
        categoria: "cron", tipoAccion: "cron.followup-learning", fase: "error", traceId,
        resultado: String(e), metadata: { intentoId: intento.id },
      }));

      await db()
        .from("followup_attempts_log")
        .update({
          got_response: respuesta,
          response_at:  respuesta ? new Date().toISOString() : null,
        })
        .eq("id", intento.id);

      actualizados++;
    }

    const resultado = { procesados: intentos.length, actualizados, duracion_ms: Date.now() - inicio };

    void logSistema({
      categoria: "cron", tipoAccion: "cron.followup-learning", fase: "ok", traceId,
      resultado: JSON.stringify(resultado), metadata: resultado,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.followup-learning", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
