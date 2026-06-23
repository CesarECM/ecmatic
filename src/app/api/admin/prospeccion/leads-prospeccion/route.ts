// S35.2 — Lista leads de canal prospeccion_lista_propia para el tab Reconexión
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const { data } = await supabase
      .from("leads")
      .select("id, nombre, telefono")
      .eq("canal_origen", "prospeccion_lista_propia")
      .eq("activo", true)
      .eq("archivado", false)
      .order("created_at", { ascending: false })
      .limit(500);
    return NextResponse.json({ leads: data ?? [] });
  } catch (err) {
    console.error("[leads-prospeccion]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
