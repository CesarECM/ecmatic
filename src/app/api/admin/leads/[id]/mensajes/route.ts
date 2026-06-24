import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessageWithRetry } from "@/lib/whatsapp/client";
import { enviarTemplateMensaje } from "@/lib/whatsapp/templates-api";
import { obtenerTemplate } from "@/services/wa-templates";
import { logSistema } from "@/services/log-sistema";

const LIMITE_DEFAULT = 20;
const MSG_SELECT = "id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at";

// GET ?antes=ISO_TIMESTAMP&limite=20 → mensajes anteriores a esa fecha (cursor-based)
// GET ?limite=20                     → últimos N mensajes del lead
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const antes = req.nextUrl.searchParams.get("antes");
  const limite = Math.min(
    Number(req.nextUrl.searchParams.get("limite") ?? LIMITE_DEFAULT),
    50
  );

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("mensajes")
    .select(MSG_SELECT)
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (antes) query = query.lt("created_at", antes);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mensajes = ((data ?? []) as unknown[]).reverse();
  return NextResponse.json({ mensajes, hayMas: (data ?? []).length === limite });
}

// POST { contenido }                    → texto libre
// POST { templateId, variables? }       → template aprobado
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { contenido?: string; templateId?: string; variables?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, telefono")
    .eq("id", id)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  if (!lead.telefono) return NextResponse.json({ error: "El lead no tiene teléfono" }, { status: 400 });

  // --- Flujo template ---
  if (body.templateId) {
    const template = await obtenerTemplate(body.templateId);
    if (!template || template.estado_meta !== "APPROVED") {
      return NextResponse.json({ error: "Template no válido o no aprobado" }, { status: 400 });
    }
    const vars = body.variables ?? [];
    const bodyComp = template.componentes.find((c) => c.type === "BODY");
    const contenidoRaw = bodyComp?.text ?? template.nombre;
    const contenido = contenidoRaw.replace(
      /\{\{(\d+)\}\}/g,
      (_, n) => vars[Number(n) - 1] ?? ""
    );
    try {
      await enviarTemplateMensaje({
        to: lead.telefono,
        templateNombre: template.nombre,
        idioma: template.idioma,
        variables: vars.length ? vars : undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mensaje, error: msgErr } = await (supabase as any)
        .from("mensajes")
        .insert({ lead_id: id, canal: "whatsapp", direccion: "saliente", contenido })
        .select(MSG_SELECT)
        .single();
      if (msgErr) throw new Error(msgErr.message);
      void logSistema({
        categoria: "ui", tipoAccion: "leads.enviar-wa-template", fase: "ok",
        leadId: id, metadata: { template: template.nombre, vars: vars.length },
      });
      return NextResponse.json({ mensaje });
    } catch (err) {
      void logSistema({
        categoria: "ui", tipoAccion: "leads.enviar-wa-template", fase: "error",
        leadId: id, resultado: String(err),
      });
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // --- Flujo texto libre ---
  const contenido = (body.contenido ?? "").trim();
  if (!contenido) return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });

  try {
    await sendTextMessageWithRetry(lead.telefono, contenido);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mensaje, error: msgErr } = await (supabase as any)
      .from("mensajes")
      .insert({ lead_id: id, canal: "whatsapp", direccion: "saliente", contenido })
      .select(MSG_SELECT)
      .single();
    if (msgErr) throw new Error(msgErr.message);
    void logSistema({
      categoria: "ui", tipoAccion: "leads.enviar-wa-admin", fase: "ok",
      leadId: id, metadata: { telefono: lead.telefono, chars: contenido.length },
    });
    return NextResponse.json({ mensaje });
  } catch (err) {
    void logSistema({
      categoria: "ui", tipoAccion: "leads.enviar-wa-admin", fase: "error",
      leadId: id, resultado: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
