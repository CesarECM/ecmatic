import { NextResponse } from "next/server";
import { auditarIntegridadTodos } from "@/services/auditoria-integridad";

// S29.6 — Cron diario: audita integridad funcional de todos los leads activos.
// GET /api/admin/auditoria-integridad — protegido por CRON_SECRET
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await auditarIntegridadTodos();
  return NextResponse.json({ ok: true, ...resultado });
}
