import { type NextRequest, NextResponse } from "next/server";
import { evaluarTestsAB } from "@/services/pipeline-ab";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/admin/pipeline-ab
// Cron semanal: evalúa tests A/B activos, declara ganadores o aplica benchmarks.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await evaluarTestsAB();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
