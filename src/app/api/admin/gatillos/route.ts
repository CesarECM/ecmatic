import { NextRequest, NextResponse } from "next/server";
import { verificarExpiracion } from "@/services/gatillos";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/gatillos — Vercel Cron diario: desactiva gatillos vencidos y alerta próximos
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.gatillos", fase: "inicio", resultado: "Verificando expiración de gatillos" });

  try {
    const resultado = await verificarExpiracion();
    void logSistema({ categoria: "cron", tipoAccion: "cron.gatillos", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/gatillos] Error en verificación:", mensaje);
    void logSistema({ categoria: "cron", tipoAccion: "cron.gatillos", fase: "error", resultado: mensaje, metadata: { error_message: mensaje, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
