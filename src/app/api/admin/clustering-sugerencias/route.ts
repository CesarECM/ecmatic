// S33.8 — Clustering de sugerencias por similitud coseno.
// Cron diario 4am. Protegido con CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { ejecutarClustering } from "@/services/clustering-sugerencias";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await ejecutarClustering();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
