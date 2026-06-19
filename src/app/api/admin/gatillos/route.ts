import { NextRequest, NextResponse } from "next/server";
import { verificarExpiracion } from "@/services/gatillos";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/gatillos — Vercel Cron diario: desactiva gatillos vencidos y alerta próximos
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await verificarExpiracion();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/gatillos] Error en verificación:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
