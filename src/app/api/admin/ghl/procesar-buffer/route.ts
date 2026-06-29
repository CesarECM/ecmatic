import { type NextRequest, NextResponse } from "next/server";
import { obtenerYMarcarPendientes } from "@/services/ghl-message-buffer";
import { procesarMensajeEntranteSBC } from "@/services/ghl-respuesta-sbc";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void logSistema({
    categoria:  "cron",
    tipoAccion: "ghl_buffer.scan",
    fase:       "inicio",
    resultado:  "verificando buffer de mensajes GHL",
  });

  const pendientes = await obtenerYMarcarPendientes();

  if (pendientes.length === 0) {
    void logSistema({
      categoria:  "cron",
      tipoAccion: "ghl_buffer.scan",
      fase:       "ok",
      resultado:  "sin pendientes — early exit",
    });
    return NextResponse.json({ status: "ok", procesados: 0 });
  }

  void logSistema({
    categoria:  "cron",
    tipoAccion: "ghl_buffer.scan",
    fase:       "ok",
    resultado:  `${pendientes.length} buffer(s) a procesar`,
  });

  let procesados = 0;
  let errores    = 0;

  for (const buffer of pendientes) {
    try {
      const cuerpo = buffer.cuerpos.join("\n");
      await procesarMensajeEntranteSBC({
        contactId:      buffer.contactId,
        conversationId: buffer.conversationId ?? undefined,
        body:           cuerpo,
        type:           "InboundMessage",
      });

      void logSistema({
        categoria:  "cron",
        tipoAccion: "ghl_buffer.procesar",
        fase:       "ok",
        resultado:  `${buffer.cuerpos.length} msg(s) → contactId:${buffer.contactId}`,
        metadata:   {
          contactId:  buffer.contactId,
          n_mensajes: buffer.cuerpos.length,
          preview:    cuerpo.slice(0, 80),
        },
      });
      procesados++;
    } catch (err) {
      void logSistema({
        categoria:  "cron",
        tipoAccion: "ghl_buffer.procesar",
        fase:       "error",
        resultado:  err instanceof Error ? err.message.slice(0, 200) : "Error",
        metadata:   { contactId: buffer.contactId },
      });
      errores++;
    }
  }

  return NextResponse.json({ status: "ok", procesados, errores });
}
