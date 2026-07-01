// MPS-20 S75.2 — Cron diario: ejecuta los 4 detectores KBI y genera kbi_sugerencias.
// Corre a las 14:30 UTC (8:30 AM CDMX), después del cron de calcular-scores.

import { type NextRequest, NextResponse } from "next/server";
import { detectarSugerencias } from "@/services/kbi/detector";
import { logSistema } from "@/services/log-sistema";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio  = Date.now();
  const traceId = crypto.randomUUID();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.kbi-detectar", fase: "inicio", traceId,
  });

  try {
    const resultado = await detectarSugerencias();

    void logSistema({
      categoria: "cron", tipoAccion: "cron.kbi-detectar", fase: "ok", traceId,
      resultado: `sugerencias nuevas: ${resultado.total}`,
      metadata: { ...resultado, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ ok: true, ...resultado, duracion_ms: Date.now() - inicio });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.kbi-detectar", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
