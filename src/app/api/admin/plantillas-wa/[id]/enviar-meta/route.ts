// S34.6 — Envía un template a Meta para aprobación y actualiza estado a PENDING.
import { NextRequest, NextResponse } from "next/server";
import { obtenerTemplate, actualizarEstadoMeta } from "@/services/wa-templates";
import { crearTemplateEnMeta } from "@/lib/whatsapp/templates-api";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const template = await obtenerTemplate(id);
    if (!template) return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });

    if (template.estado_meta !== "DRAFT" && template.estado_meta !== "REJECTED") {
      return NextResponse.json(
        { error: `No se puede enviar un template en estado ${template.estado_meta}` },
        { status: 400 }
      );
    }

    const { metaId } = await crearTemplateEnMeta({
      nombre: template.nombre,
      categoria: template.categoria,
      idioma: template.idioma,
      componentes: template.componentes,
    });

    await actualizarEstadoMeta(id, "PENDING", metaId);

    return NextResponse.json({ ok: true, metaId });
  } catch (err) {
    console.error("[plantillas-wa/enviar-meta POST]", err);
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
