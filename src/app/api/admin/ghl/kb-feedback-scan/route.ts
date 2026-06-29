// MPS-9 S45.4 — Cron diario: analiza patrones de edición de campaña GHL → sugerencias KB.
// Early-exit automático si no hay edits nuevas desde el último scan → costo ≈ 0 en días inactivos.
import { type NextRequest, NextResponse } from "next/server";
import { analizarPatronesEdicion } from "@/services/calidad-kb-patrones";
import { logSistema } from "@/services/log-sistema";

export const runtime = "nodejs";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.kb-feedback-scan", fase: "inicio", traceId,
    resultado: "Analizando patrones de edición GHL",
  });

  try {
    const resultado = await analizarPatronesEdicion();

    void logSistema({
      categoria: "cron", tipoAccion: "cron.kb-feedback-scan", fase: "ok", traceId,
      resultado: `procesados: ${resultado.procesados}`,
      metadata: { ...resultado, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ ok: true, ...resultado, duracion_ms: Date.now() - inicio });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.kb-feedback-scan", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
