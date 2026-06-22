import { NextResponse } from "next/server";
import { generarSugerenciasProtocolo } from "@/services/protocolo-etapa";

// S28.2 — Cron semanal: genera sugerencias de protocolo para etapas sin reglas definidas.
// GET /api/admin/protocolo-sugerencias — protegido por CRON_SECRET
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await generarSugerenciasProtocolo();
  return NextResponse.json({ ok: true });
}
