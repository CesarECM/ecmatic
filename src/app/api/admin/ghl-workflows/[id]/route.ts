import { NextRequest, NextResponse } from "next/server";
import { actualizarWorkflow } from "@/services/ghl-workflows";

// PATCH /api/admin/ghl-workflows/[id]
// Body: { clasificacion?: "keep"|"rescue"|"delete", notas?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { clasificacion?: "keep" | "rescue" | "delete"; notas?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    await actualizarWorkflow(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
