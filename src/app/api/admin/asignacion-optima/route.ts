import { NextResponse } from "next/server";
import { calcularAsignacionOptima, aplicarAsignaciones } from "@/services/asignacion-optima";

// S30.5 — Calcula y opcionalmente aplica asignaciones óptimas vendedor-lead.
// GET: devuelve propuesta (requiere aprobación)
// POST body { apply: true, asignaciones: [...] }: aplica asignaciones aprobadas
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const asignaciones = await calcularAsignacionOptima();
  return NextResponse.json({ ok: true, asignaciones });
}

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await req.json() as { asignaciones?: { leadId: string; vendedorId: string; beneficioEsperado: number }[] };
  if (!body.asignaciones?.length) {
    return NextResponse.json({ error: "Sin asignaciones" }, { status: 400 });
  }
  await aplicarAsignaciones(body.asignaciones);
  return NextResponse.json({ ok: true, aplicadas: body.asignaciones.length });
}
