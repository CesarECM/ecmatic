import { NextRequest, NextResponse } from "next/server";
import { listarWorkflows } from "@/services/ghl-workflows";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createServiceClient() as any; }

// GET /api/admin/ghl-workflows?clasificacion=keep&status=published
export async function GET(req: NextRequest) {
  const clasificacion = req.nextUrl.searchParams.get("clasificacion") ?? undefined;
  const status        = req.nextUrl.searchParams.get("status") ?? undefined;

  try {
    const workflows = await listarWorkflows({ clasificacion, status });
    return NextResponse.json({ workflows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/admin/ghl-workflows?id=xxx — eliminar registro local (no en GHL)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await db().from("ghl_workflows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
