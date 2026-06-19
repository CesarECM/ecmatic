import { NextRequest, NextResponse } from "next/server";
import { procesarSandbox } from "@/services/sandbox";

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
