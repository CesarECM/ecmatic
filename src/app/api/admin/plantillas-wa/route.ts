import { NextRequest, NextResponse } from "next/server";
import { listarTemplates, crearTemplate } from "@/services/wa-templates";

export async function GET() {
  try {
    const templates = await listarTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[plantillas-wa GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, categoria, idioma, componentes, imagen_servicio_id } = body;

    if (!nombre?.trim() || !categoria || !Array.isArray(componentes)) {
      return NextResponse.json({ error: "nombre, categoria y componentes requeridos" }, { status: 400 });
    }

    const template = await crearTemplate({ nombre, categoria, idioma, componentes, imagen_servicio_id });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error("[plantillas-wa POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
