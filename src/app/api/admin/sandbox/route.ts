import { NextRequest, NextResponse } from "next/server";
import { procesarSandbox } from "@/services/sandbox";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });
  }
  try {
    const supabase = createServiceClient();
    const telefono = `sandbox_${sessionId.slice(0, 12)}`;
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("telefono", telefono)
      .maybeSingle();
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
