import { NextRequest, NextResponse } from "next/server";
import { ejecutarMonitorVendedores } from "@/services/monitor-vendedores";

// GET /api/admin/vendedor-monitor?secret=CRON_SECRET — S25.5/S25.6
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await ejecutarMonitorVendedores();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
