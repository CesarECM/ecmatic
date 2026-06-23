import { NextRequest, NextResponse } from "next/server";
import { obtenerTemplate, actualizarTemplate, eliminarTemplate } from "@/services/wa-templates";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await obtenerTemplate(id);
    if (!template) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[plantillas-wa/id GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    await actualizarTemplate(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[plantillas-wa/id PATCH]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await eliminarTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[plantillas-wa/id DELETE]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
