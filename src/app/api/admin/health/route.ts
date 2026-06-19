import { NextRequest, NextResponse } from "next/server";
import { verificarSalud, alertarIntegracionesRojas } from "@/services/health";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/health — usado por el panel LED (sin auth para polling cliente)
// y por el cron para alertas (con auth)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const esCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;

  const indicadores = await verificarSalud();

  if (esCron) {
    await alertarIntegracionesRojas(indicadores);
  }

  return NextResponse.json({ indicadores, ts: new Date().toISOString() });
}
