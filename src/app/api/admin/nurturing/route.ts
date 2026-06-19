import { NextRequest, NextResponse } from "next/server";
import { ejecutarCicloReengagement } from "@/services/reengagement";

const SEED_TOKEN = process.env.SEED_SECRET_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/nurturing — invocado por Vercel Cron (9am L-V hora CDMX = 15:00 UTC)
// Vercel inyecta Authorization: Bearer <CRON_SECRET> automáticamente.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await ejecutarCicloReengagement();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/nurturing] Error en ciclo cron:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

// POST /api/admin/nurturing — disparo manual desde panel o scripts
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!SEED_TOKEN || auth !== `Bearer ${SEED_TOKEN}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await ejecutarCicloReengagement();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/nurturing] Error en ciclo:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
