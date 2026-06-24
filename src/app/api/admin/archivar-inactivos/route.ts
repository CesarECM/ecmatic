import { NextRequest, NextResponse } from "next/server";
import { ejecutarArchivoAutomatico } from "@/services/limpieza-leads";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET — Vercel Cron (domingos 6:00 UTC)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.archivar-inactivos", fase: "inicio", resultado: "Archivando leads inactivos" });

  try {
    const resultado = await ejecutarArchivoAutomatico();
    void logSistema({ categoria: "cron", tipoAccion: "cron.archivar-inactivos", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    void logSistema({ categoria: "cron", tipoAccion: "cron.archivar-inactivos", fase: "error", resultado: msg, metadata: { error_message: msg, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
