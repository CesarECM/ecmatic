// S24.4 — Endpoint admin: detecta servicios sin brochure y genera sugerencias IA.
// Protegido con CRON_SECRET. Puede llamarse desde cron o panel admin.

import { NextRequest, NextResponse } from "next/server";
import { scanearBrochuresFaltantes } from "@/services/brochures-faltantes";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await scanearBrochuresFaltantes();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
