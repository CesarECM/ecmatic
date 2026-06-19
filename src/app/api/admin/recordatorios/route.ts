import { NextRequest, NextResponse } from "next/server";
import { enviarRecordatoriosCitas } from "@/services/recordatorios";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/recordatorios — Vercel Cron cada 30 min: envía recordatorios de citas
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await enviarRecordatoriosCitas();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/recordatorios]", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
