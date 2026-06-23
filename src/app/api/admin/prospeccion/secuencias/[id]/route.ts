// S34.2 — Actualizar / eliminar secuencia + gestión de pasos
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    await db()
      .from("prospeccion_secuencias")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[prospeccion/secuencias/id PATCH]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db().from("prospeccion_secuencias").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[prospeccion/secuencias/id DELETE]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
