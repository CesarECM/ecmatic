import { NextRequest, NextResponse } from "next/server";
import { dispararAuditoria } from "@/services/auditor-servicios";

// POST /api/admin/auditor-servicios?servicioId=xxx — trigger manual desde panel
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const servicioId = req.nextUrl.searchParams.get("servicioId");
  if (!servicioId) return NextResponse.json({ error: "servicioId requerido" }, { status: 400 });

  try {
    await dispararAuditoria(servicioId, "editar");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
