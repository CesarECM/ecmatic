// S34.3 — CRON diario 7am: ejecuta pasos de secuencias de prospección omnicanal.
import { NextRequest, NextResponse } from "next/server";
import { ejecutarSecuencias } from "@/services/prospeccion-secuencial";
import { registrarEjecucionCron } from "@/services/cron-log";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await ejecutarSecuencias();
    await registrarEjecucionCron("ejecutar-prospeccion-secuencial", resultado).catch(() => {});
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
