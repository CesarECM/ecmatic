import { NextRequest, NextResponse } from "next/server";
import { procesarSandbox } from "@/services/sandbox";
import { createServiceClient } from "@/lib/supabase/service";

async function getLeadBySession(sessionId: string) {
  const supabase = createServiceClient();
  const telefono = `sandbox_${sessionId.slice(0, 12)}`;
  // is_test no está en los tipos generados — cast a any hasta regenerar schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (supabase as any)
    .from("leads")
    .select("id, pipeline_stage, pipeline_ruta, is_test")
    .eq("telefono", telefono)
    .maybeSingle() as { data: { id: string; pipeline_stage: string | null; pipeline_ruta: string | null; is_test: boolean } | null };
  return { supabase, lead };
}

// GET ?sessionId=xxx              → lista de mensajes de la sesión
// GET ?sessionId=xxx&estado=1     → resumen del estado del lead de prueba
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });

  try {
    const { supabase, lead } = await getLeadBySession(sessionId);

    // Resumen de estado para pantalla previa a eliminación
    if (req.nextUrl.searchParams.get("estado") === "1") {
      if (!lead) return NextResponse.json({ encontrado: false });

      const leadId = lead.id;
      const [
        { data: cagc },
        tareaRaw,
        { count: totalMensajes },
        { data: msgIds },
      ] = await Promise.all([
        supabase.from("lead_cagc_estado").select("fase_numero").eq("lead_id", leadId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("lead_tarea_activa").select("tipo, motivo").eq("lead_id", leadId).maybeSingle(),
        supabase.from("mensajes").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
        supabase.from("mensajes").select("id").eq("lead_id", leadId),
      ]);

      const ids = (msgIds ?? []).map((m: { id: string }) => m.id);
      const { count: votosNegativos } = ids.length > 0
        ? await supabase.from("votos_respuesta").select("id", { count: "exact", head: true }).in("mensaje_id", ids).eq("voto", "malo")
        : { count: 0 };

      return NextResponse.json({
        encontrado: true,
        pipeline_stage: lead.pipeline_stage,
        pipeline_ruta: lead.pipeline_ruta,
        faseCAGC: (cagc as { fase_numero?: number } | null)?.fase_numero ?? null,
        tareaActiva: tareaRaw.data ?? null,
        totalMensajes: totalMensajes ?? 0,
        votosNegativos: votosNegativos ?? 0,
      });
    }

    // Lista de mensajes
    if (!lead) return NextResponse.json({ mensajes: [] });
    const { data: mensajes } = await supabase
      .from("mensajes")
      .select("id, direccion, contenido, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ mensajes: mensajes ?? [] });
  } catch (error) {
    console.error("[sandbox GET]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE ?sessionId=xxx — elimina el lead de prueba (el resto hace cascade)
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });

  try {
    const { supabase, lead } = await getLeadBySession(sessionId);
    if (!lead || !lead.is_test) return NextResponse.json({ eliminado: false, motivo: "Lead no encontrado o no es de prueba" });

    // Eliminar pagos primero (FK sin cascade) — los leads de prueba no deberían tener pagos reales
    await supabase.from("pagos").delete().eq("lead_id", lead.id);

    // Eliminar lead — todo lo demás hace ON DELETE CASCADE
    await supabase.from("leads").delete().eq("id", lead.id);

    return NextResponse.json({ eliminado: true });
  } catch (error) {
    console.error("[sandbox DELETE]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, mensaje } = await req.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });
    }
    if (!mensaje || typeof mensaje !== "string" || !mensaje.trim()) {
      return NextResponse.json({ error: "mensaje requerido" }, { status: 400 });
    }
    const resultado = await procesarSandbox(sessionId, mensaje.trim());
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[sandbox]", error);
    return NextResponse.json({ error: "Error interno al procesar el mensaje" }, { status: 500 });
  }
}
