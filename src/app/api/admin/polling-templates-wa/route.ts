// S34.6 — CRON cada 2h: consulta Meta y actualiza estado de templates PENDING.
import { NextRequest, NextResponse } from "next/server";
import { listarTemplatesPendientes, actualizarEstadoMeta } from "@/services/wa-templates";
import { consultarEstadoTemplate } from "@/lib/whatsapp/templates-api";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const pendientes = await listarTemplatesPendientes();
    let actualizados = 0;

    for (const tmpl of pendientes) {
      if (!tmpl.meta_template_id) continue;
      try {
        const { status } = await consultarEstadoTemplate(tmpl.meta_template_id);
        if (status !== "PENDING") {
          await actualizarEstadoMeta(
            tmpl.id,
            status,
            undefined,
            status === "APPROVED"
          );
          actualizados++;
        }
      } catch (err) {
        console.error("[polling-templates-wa] error en template", tmpl.id, err);
      }
    }

    return NextResponse.json({ consultados: pendientes.length, actualizados });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
