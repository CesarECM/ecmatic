import { NextRequest, NextResponse } from "next/server";
import { enviarResumenSemanal } from "@/services/resumen-semanal";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/resumen-semanal — cron lunes 8am CDMX (14:00 UTC)
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    await enviarResumenSemanal();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/resumen-semanal]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
