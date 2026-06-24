import { type NextRequest, NextResponse } from "next/server";
import { detectarPipelinesFaltantes } from "@/services/pipeline-detector";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/admin/pipeline-detector
// Cron semanal (o manual): detecta servicios con alto volumen sin pipeline dedicado
// y genera sugerencias en la cola de aprobaciones.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.pipeline-detector", fase: "inicio", resultado: "Detectando pipelines faltantes" });

  try {
    const resultado = await detectarPipelinesFaltantes();
    void logSistema({ categoria: "cron", tipoAccion: "cron.pipeline-detector", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({ categoria: "cron", tipoAccion: "cron.pipeline-detector", fase: "error", resultado: mensaje, metadata: { error_message: mensaje, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
