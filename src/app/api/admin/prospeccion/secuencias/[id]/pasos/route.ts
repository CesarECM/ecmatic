// S34.2 — CRUD de pasos individuales de una secuencia
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: secuenciaId } = await params;
    const body = await req.json();

    const { canal, delay_dias = 0, condicion_trigger = "siempre", template_wa_id, asunto_email, cuerpo_email } = body;
    if (!canal) return NextResponse.json({ error: "canal requerido" }, { status: 400 });

    // Calcular siguiente orden
    const { data: ultimos } = await db()
      .from("prospeccion_secuencia_pasos")
      .select("orden")
      .eq("secuencia_id", secuenciaId)
      .order("orden", { ascending: false })
      .limit(1);
    const orden = ultimos?.length ? (ultimos[0].orden as number) + 1 : 0;

    const { data, error } = await db()
      .from("prospeccion_secuencia_pasos")
      .insert({
        secuencia_id: secuenciaId,
        orden,
        canal,
        delay_dias,
        condicion_trigger,
        template_wa_id: template_wa_id || null,
        asunto_email: asunto_email || null,
        cuerpo_email: cuerpo_email || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ paso: data }, { status: 201 });
  } catch (err) {
    console.error("[pasos POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: secuenciaId } = await params;
    const pasoId = req.nextUrl.searchParams.get("pasoId");
    if (!pasoId) return NextResponse.json({ error: "pasoId requerido" }, { status: 400 });

    await db()
      .from("prospeccion_secuencia_pasos")
      .delete()
      .eq("id", pasoId)
      .eq("secuencia_id", secuenciaId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pasos DELETE]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
