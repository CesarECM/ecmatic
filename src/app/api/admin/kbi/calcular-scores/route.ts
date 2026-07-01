// MPS-20 S74.2 — Cron diario: recalcula kbi_score para todos los recursos con señales.
// Corre a las 3:30 AM CDMX (después del cron de limpieza de logs a las 3:00 AM).

import { type NextRequest, NextResponse } from "next/server";
import { calcularScoresBatch } from "@/services/kbi/scores";
import { logSistema } from "@/services/log-sistema";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  const traceId = crypto.randomUUID();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.kbi-calcular-scores", fase: "inicio", traceId,
  });

  try {
    const resultado = await calcularScoresBatch();

    void logSistema({
      categoria: "cron", tipoAccion: "cron.kbi-calcular-scores", fase: "ok", traceId,
      resultado: `actualizados: ${resultado.actualizados}`,
      metadata: { ...resultado, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ ok: true, ...resultado, duracion_ms: Date.now() - inicio });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.kbi-calcular-scores", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
