import { NextRequest, NextResponse } from "next/server";
import { enviarRecordatoriosCitas } from "@/services/recordatorios";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/recordatorios — Vercel Cron cada 30 min: envía recordatorios de citas
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.recordatorios", fase: "inicio", resultado: "Enviando recordatorios de citas" });

  try {
    const resultado = await enviarRecordatoriosCitas();
    void logSistema({ categoria: "cron", tipoAccion: "cron.recordatorios", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/recordatorios]", mensaje);
    void logSistema({ categoria: "cron", tipoAccion: "cron.recordatorios", fase: "error", resultado: mensaje, metadata: { error_message: mensaje, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
