// S21.1/S21.2 — Registra votos de calidad y dispara análisis de mejora en votos negativos.
import { NextRequest, NextResponse } from "next/server";
import { registrarVoto, type TipoVoto } from "@/services/votos";
import { procesarFeedbackNegativo } from "@/services/feedback-votos";

export async function POST(req: NextRequest) {
  try {
    const { mensajeId, voto, comentario } = await req.json();
    if (!mensajeId || !voto || !["bueno", "malo"].includes(voto)) {
      return NextResponse.json({ error: "mensajeId y voto ('bueno'|'malo') requeridos" }, { status: 400 });
    }
    await registrarVoto(mensajeId, voto as TipoVoto, comentario);

    // S21.2 — Análisis reactivo: votos negativos generan sugerencias de mejora
    if (voto === "malo") {
      void procesarFeedbackNegativo(mensajeId, comentario ?? null).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
