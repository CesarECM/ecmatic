// MPS-13 S51 — Endpoint manual/cron: detecta leads sin cobertura y les asigna tipo correcto.
// Protegido con CRON_SECRET. Parámetro opcional ?limite=200.
import { type NextRequest, NextResponse } from "next/server";
import { reclasificarCobertura } from "@/services/reclasificar-cobertura";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const limite = Math.min(
    parseInt(req.nextUrl.searchParams.get("limite") ?? "200", 10) || 200,
    500,
  );

  const resultado = await reclasificarCobertura(limite);
  return NextResponse.json({ ok: true, ...resultado });
}
