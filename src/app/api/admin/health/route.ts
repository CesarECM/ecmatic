import { NextRequest, NextResponse } from "next/server";
import { verificarSalud, alertarIntegracionesRojas } from "@/services/health";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/health — usado por el panel LED (sin auth para polling cliente)
// y por el cron para alertas (con auth)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const esCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;

  const inicio = Date.now();
  if (esCron) {
    void logSistema({ categoria: "cron", tipoAccion: "cron.health", fase: "inicio", resultado: "Verificando salud del sistema" });
  }

  const indicadores = await verificarSalud();

  if (esCron) {
    await alertarIntegracionesRojas(indicadores);
    const noOk = indicadores.filter(i => i.estado !== "ok");
    void logSistema({
      categoria:  "cron",
      tipoAccion: "cron.health",
      fase:       noOk.length === 0 ? "ok" : noOk.some(i => i.estado === "error") ? "error" : "warn",
      resultado:  `${indicadores.filter(i => i.estado === "ok").length}/${indicadores.length} OK`,
      metadata:   {
        total:    indicadores.length,
        ok:       indicadores.filter(i => i.estado === "ok").length,
        degraded: indicadores.filter(i => i.estado === "degraded").length,
        errores:  indicadores.filter(i => i.estado === "error").length,
        no_ok:    noOk.map(i => ({ nombre: i.nombre, estado: i.estado, mensaje: i.mensaje })),
        duracion_ms: Date.now() - inicio,
      },
    });
  }

  return NextResponse.json({ indicadores, ts: new Date().toISOString() });
}
