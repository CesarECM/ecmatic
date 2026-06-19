import { NextRequest, NextResponse } from "next/server";
import { sincronizarProgreso, detectarInactividad } from "@/services/smartbuilder";
import { verificarChurnYAlertar } from "@/services/churn";
import { ejecutarUpsell } from "@/services/postventa";

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/admin/smartbuilder — Cron diario: sincroniza progreso + detecta inactividad + churn + upsell
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const [progreso, inactividad, churn, upsell] = await Promise.allSettled([
      sincronizarProgreso(),
      detectarInactividad(),
      verificarChurnYAlertar(),
      ejecutarUpsell(),
    ]);

    return NextResponse.json({
      ok: true,
      progreso:   progreso.status === "fulfilled" ? progreso.value : null,
      inactividad: inactividad.status === "fulfilled" ? inactividad.value : null,
      churn:      churn.status === "fulfilled" ? churn.value : null,
      upsell:     upsell.status === "fulfilled" ? upsell.value : null,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
