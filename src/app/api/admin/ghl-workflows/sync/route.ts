import { NextRequest, NextResponse } from "next/server";
import { sincronizarWorkflows } from "@/services/ghl-workflows";

async function handler(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await sincronizarWorkflows();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET — Vercel cron semanal (lunes 6am)
export const GET = handler;
// POST — disparo manual desde el panel
export const POST = handler;
