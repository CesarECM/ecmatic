// S23.7 — API endpoint: valida que todos los leads con tarea activa tienen punto de contacto próximo
import { NextResponse } from "next/server";
import { alertarLeadsSinContacto } from "@/services/validador-contacto";

// GET /api/admin/contacto-validador — ejecutar desde cron (CRON_SECRET) o panel admin
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const alertasCreadas = await alertarLeadsSinContacto();
  return NextResponse.json({ ok: true, alertas_creadas: alertasCreadas });
}
