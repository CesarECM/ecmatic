// S33.7 — Auditoría mensual del umbral adaptativo de auto-aprobación.
// Cron mensual (día 1 de cada mes, 0am). Protegido con CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { auditarUmbralAutoaprobacion } from "@/services/auditor-autoaprobacion";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await auditarUmbralAutoaprobacion();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
