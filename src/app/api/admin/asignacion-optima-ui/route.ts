// S35.3 — Endpoint UI para asignación óptima (sin CRON_SECRET en URL)
// POST: calcula propuesta · PUT: aplica asignaciones aprobadas
import { NextRequest, NextResponse } from "next/server";
import { calcularAsignacionOptima, aplicarAsignaciones } from "@/services/asignacion-optima";

export async function POST() {
  try {
    const asignaciones = await calcularAsignacionOptima();
    return NextResponse.json({ asignaciones });
  } catch (err) {
    console.error("[asignacion-optima-ui POST]", err);
    return NextResponse.json({ error: "Error al calcular" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { asignaciones } = await req.json();
    if (!Array.isArray(asignaciones) || !asignaciones.length) {
      return NextResponse.json({ error: "Sin asignaciones" }, { status: 400 });
    }
    await aplicarAsignaciones(asignaciones);
    return NextResponse.json({ aplicadas: asignaciones.length });
  } catch (err) {
    console.error("[asignacion-optima-ui PUT]", err);
    return NextResponse.json({ error: "Error al aplicar" }, { status: 500 });
  }
}
