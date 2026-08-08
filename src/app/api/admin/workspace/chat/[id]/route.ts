// GET /api/admin/workspace/chat/[id]
// Devuelve los datos mínimos que necesita ChatWhatsAppLead para renderizar.
// Llamado por LeadDetailPane al seleccionar un lead (y en cada chatRefreshKey).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { listarTemplates } from "@/services/wa-templates";
import { obtenerPendienteGHLParaLead } from "@/services/ghl-aprobacion";
import { telVisible } from "@/lib/utils";

async function verificarAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: p } = await (createServiceClient() as any)
      .from("profiles").select("rol").eq("id", user.id).single();
    return p?.rol === "admin";
  } catch { return false; }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verificarAdmin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient() as any;
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: lead },
    { data: mensajesDesc },
    { data: msgReciente24h },
    todosTemplates,
    modoSistema,
    pendienteGHL,
  ] = await Promise.all([
    supabase.from("leads").select("id, nombre, telefono").eq("id", id).maybeSingle(),
    supabase.from("mensajes")
      .select("id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at")
      .eq("lead_id", id).order("created_at", { ascending: false }).limit(21),
    supabase.from("mensajes").select("id")
      .eq("lead_id", id).eq("direccion", "entrante").gte("created_at", hace24h).limit(1),
    listarTemplates().catch(() => []),
    obtenerModo().catch(() => "automatico" as const),
    obtenerPendienteGHLParaLead(id).catch(() => null),
  ]);

  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const hayMasIniciales = (mensajesDesc ?? []).length === 21;
  const mensajesIniciales = ((mensajesDesc ?? []) as unknown[]).slice(0, 20).reverse();
  const dentro24h        = (msgReciente24h ?? []).length > 0;
  const templatesAprobados = (todosTemplates as { estado_meta: string }[])
    .filter((t) => t.estado_meta === "APPROVED");

  return NextResponse.json({
    lead:              { id: lead.id, nombre: lead.nombre ?? null, telefono: lead.telefono ?? null },
    telefonoLead:      telVisible(lead.telefono),
    mensajesIniciales,
    hayMasIniciales,
    dentro24h,
    modoSistema,
    templatesAprobados,
    pendienteGHL:      pendienteGHL ?? null,
  });
}
