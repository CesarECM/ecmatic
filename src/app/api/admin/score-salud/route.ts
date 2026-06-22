import { NextResponse } from "next/server";
import { recalcularTodosLosScores, calibrarPesos } from "@/services/score-salud";

// S30.1 — Cron semanal: recalcula score_salud de todos los leads activos
// y re-calibra los pesos del modelo con el histórico de conversión.
// GET /api/admin/score-salud — protegido por CRON_SECRET
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Calibrar primero (actualiza pesos en BD)
  const pesosNuevos = await calibrarPesos();

  // Luego recalcular todos los scores con los pesos nuevos
  const { actualizados } = await recalcularTodosLosScores();

  return NextResponse.json({ ok: true, actualizados, pesos: pesosNuevos });
}
