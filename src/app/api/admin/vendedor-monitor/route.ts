import { NextRequest, NextResponse } from "next/server";
import { ejecutarMonitorVendedores } from "@/services/monitor-vendedores";
import { logSistema } from "@/services/log-sistema";

// GET /api/admin/vendedor-monitor?secret=CRON_SECRET — S25.5/S25.6
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const inicio = Date.now();
  void logSistema({ categoria: "cron", tipoAccion: "cron.vendedor-monitor", fase: "inicio", resultado: "Monitoreando vendedores" });

  try {
    const resultado = await ejecutarMonitorVendedores();
    void logSistema({ categoria: "cron", tipoAccion: "cron.vendedor-monitor", fase: "ok", resultado: JSON.stringify(resultado).slice(0, 300), metadata: { ...resultado, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = String(err);
    void logSistema({ categoria: "cron", tipoAccion: "cron.vendedor-monitor", fase: "error", resultado: msg.slice(0, 200), metadata: { error_message: msg, duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
