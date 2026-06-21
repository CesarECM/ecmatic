// S26.2 — Endpoint: obtiene y procesa el transcripto de Meet para una cita
import { NextResponse } from "next/server";
import { procesarTranscriptoMeet } from "@/services/meet-post-sesion";

const MENSAJES: Record<string, string> = {
  sin_meet_link: "La cita no tiene un enlace de Google Meet.",
  sin_token: "El vendedor no tiene Google Calendar conectado o el token expiró.",
  sin_scope: "El vendedor debe reconectar Google Calendar para habilitar acceso a transcriptos de Meet.",
  sin_record: "No se encontró registro de conferencia para esta reunión. ¿Ya finalizó la sesión?",
  sin_transcripto: "El transcripto aún no está disponible. Espera unos minutos tras finalizar la sesión.",
  error: "Error inesperado al obtener el transcripto.",
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as { citaId?: string };
    if (!body.citaId) {
      return NextResponse.json({ error: "citaId requerido" }, { status: 400 });
    }

    const resultado = await procesarTranscriptoMeet(body.citaId);

    if (!resultado.ok) {
      return NextResponse.json(
        { error: MENSAJES[resultado.razon] ?? "Error desconocido", razon: resultado.razon },
        { status: 422 }
      );
    }

    return NextResponse.json({ transcriptoId: resultado.transcriptoId });
  } catch (err) {
    console.error("[meet-transcripto]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
