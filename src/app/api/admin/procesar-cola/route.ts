import { type NextRequest, NextResponse } from "next/server";
import { procesarCola } from "@/services/mensajes-cola";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.procesar-cola", fase: "inicio", resultado: "Iniciando procesamiento de cola" });

  try {
    const resultado = await procesarCola();
    console.log("[procesar-cola]", resultado);
    void logSistema({ categoria: "cron", tipoAccion: "cron.procesar-cola", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    void logSistema({ categoria: "cron", tipoAccion: "cron.procesar-cola", fase: "error", resultado: msg, metadata: { error_message: msg, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
