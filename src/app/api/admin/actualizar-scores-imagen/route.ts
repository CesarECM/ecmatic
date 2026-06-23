// S34.8 — CRON domingos 6am: actualiza score_conversion en imagenes_servicio.
import { NextRequest, NextResponse } from "next/server";
import { actualizarScoresImagenes } from "@/services/actualizar-scores-imagen";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await actualizarScoresImagenes();
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
