import { NextRequest, NextResponse } from "next/server";
import { ejecutarCicloCalidadKB } from "@/services/calidad-kb-patrones";

const CRON_SECRET = process.env.CRON_SECRET;

// GET — Vercel Cron (lunes 7:00 UTC, antes del resumen semanal)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await ejecutarCicloCalidadKB();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
