import { NextRequest, NextResponse } from "next/server";
import { ejecutarCicloReengagement } from "@/services/reengagement";

const SEED_TOKEN = process.env.SEED_SECRET_TOKEN;

// POST /api/admin/nurturing
// Dispara el ciclo de re-engagement para todos los leads elegibles.
// Protegido con Bearer token (mismo que otros endpoints admin).
// Diseñado para invocarse desde Vercel Cron o cron externo.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!SEED_TOKEN || auth !== `Bearer ${SEED_TOKEN}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await ejecutarCicloReengagement();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    console.error("[api/nurturing] Error en ciclo:", mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
