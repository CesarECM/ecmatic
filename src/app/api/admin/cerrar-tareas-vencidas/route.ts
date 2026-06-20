import { NextRequest, NextResponse } from "next/server";
import { procesarTareasVencidas } from "@/services/motor-tareas";

const CRON_SECRET = process.env.CRON_SECRET;

// GET — Vercel Cron (diario 05:00 UTC)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await procesarTareasVencidas();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
