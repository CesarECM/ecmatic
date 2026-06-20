// S21.1 — Endpoint para registrar votos de calidad sobre respuestas IA.
import { NextRequest, NextResponse } from "next/server";
import { registrarVoto, type TipoVoto } from "@/services/votos";

export async function POST(req: NextRequest) {
  try {
    const { mensajeId, voto, comentario } = await req.json();
    if (!mensajeId || !voto || !["bueno", "malo"].includes(voto)) {
      return NextResponse.json({ error: "mensajeId y voto ('bueno'|'malo') requeridos" }, { status: 400 });
    }
    await registrarVoto(mensajeId, voto as TipoVoto, comentario);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
