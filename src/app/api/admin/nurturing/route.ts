import { NextRequest, NextResponse } from "next/server";
import { ejecutarCicloReengagement } from "@/services/reengagement";
import { logSistema } from "@/services/log-sistema";

const SEED_TOKEN = process.env.SEED_SECRET_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/nurturing — invocado por Vercel Cron (9am L-V hora CDMX = 15:00 UTC)
// Vercel inyecta Authorization: Bearer <CRON_SECRET> automáticamente.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "inicio", resultado: "Iniciando ciclo de nurturing" });

  try {
    const resultado = await ejecutarCicloReengagement();
    void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/nurturing] Error en ciclo cron:", mensaje);
    void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "error", resultado: mensaje, metadata: { error_message: mensaje, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

// POST /api/admin/nurturing — disparo manual desde panel o scripts
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!SEED_TOKEN || auth !== `Bearer ${SEED_TOKEN}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "inicio", resultado: "Disparo manual de nurturing" });

  try {
    const resultado = await ejecutarCicloReengagement();
    void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, manual: true, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/nurturing] Error en ciclo:", mensaje);
    void logSistema({ categoria: "cron", tipoAccion: "cron.nurturing", fase: "error", resultado: mensaje, metadata: { error_message: mensaje, manual: true, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
