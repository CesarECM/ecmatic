// S20.7 — Endpoint admin: analiza rendimiento de nurturing y propone ajustes.
// Protegido con CRON_SECRET. Recomendado ejecutar semanalmente.

import { NextRequest, NextResponse } from "next/server";
import { proponerAjustesNurturing } from "@/services/nurturing-ia";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await proponerAjustesNurturing();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
