import { NextRequest, NextResponse } from "next/server";
import { scanGlobalPipelines, dispararAuditoriaPipeline } from "@/services/auditor-pipelines";

// GET /api/admin/auditor-pipelines — CRON semanal (domingos 7am) o disparo manual
// Opcional: ?ruta=xxx para auditar un solo pipeline
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ruta = req.nextUrl.searchParams.get("ruta");

  try {
    if (ruta) {
      await dispararAuditoriaPipeline(ruta, "scan_global");
      return NextResponse.json({ ok: true, pipeline: ruta });
    }
    await scanGlobalPipelines();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
