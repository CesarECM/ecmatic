// S20.6 — Endpoint admin: analiza conversaciones y sugiere custom fields.
// Protegido con CRON_SECRET. Puede llamarse desde cron o panel admin.

import { NextRequest, NextResponse } from "next/server";
import { scanearCustomFields } from "@/services/custom-fields";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await scanearCustomFields();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
