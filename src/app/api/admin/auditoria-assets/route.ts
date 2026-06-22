// S33.4 — Auditoría de assets: detecta servicios sin imagen activa y genera briefs de diseño.
// Cron semanal lunes 8am. Protegido con CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { ejecutarAuditoriaAssets } from "@/services/auditoria-assets";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await ejecutarAuditoriaAssets();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
