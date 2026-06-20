import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

interface EntradaReconexion {
  leadId: string;
  telefono: string;
}

// S22.8 — Encola un mensaje de reconexión (sin oferta) para cada lead importado
export async function POST(req: NextRequest) {
  try {
    const { entradas, mensaje } = await req.json() as { entradas: EntradaReconexion[]; mensaje: string };
    if (!Array.isArray(entradas) || !entradas.length || !mensaje?.trim()) {
      return NextResponse.json({ error: "entradas y mensaje requeridos" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const filas = entradas.map(({ leadId, telefono }) => ({
      lead_id: leadId,
      telefono,
      respuesta: mensaje.trim(),
      bloques: [],
      aprobado: null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("mensajes_cola_aprobacion").insert(filas);
    if (error) throw new Error(error.message);

    return NextResponse.json({ encolados: filas.length });
  } catch (error) {
    console.error("[prospeccion/reconexion]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
