import { NextRequest, NextResponse } from "next/server";
import { ejecutarCicloCalidadKB } from "@/services/calidad-kb-patrones";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET — Vercel Cron (lunes 7:00 UTC, antes del resumen semanal)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.calidad-kb", fase: "inicio", resultado: "Ejecutando ciclo de calidad KB" });

  try {
    const resultado = await ejecutarCicloCalidadKB();
    void logSistema({ categoria: "cron", tipoAccion: "cron.calidad-kb", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    void logSistema({ categoria: "cron", tipoAccion: "cron.calidad-kb", fase: "error", resultado: msg, metadata: { error_message: msg, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
