import { type NextRequest, NextResponse } from "next/server";
import { detectarPipelinesFaltantes } from "@/services/pipeline-detector";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/admin/pipeline-detector
// Cron semanal (o manual): detecta servicios con alto volumen sin pipeline dedicado
// y genera sugerencias en la cola de aprobaciones.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await detectarPipelinesFaltantes();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
