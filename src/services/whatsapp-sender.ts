import { sendTextMessageWithRetry } from "@/lib/whatsapp/client";
import { encolarMensaje } from "@/services/mensajes-cola";
import { obtenerModo } from "@/services/sistema";
import { logDebugIA } from "@/services/log-ia";
import { logSistema } from "@/services/log-sistema";

const DELAY_MS = 1_500;

// S1.5 + S1.6 — Envía bloques con delay simulado entre ellos.
// En modo depuración los bloques se interceptan y no llegan al lead,
// salvo que el llamador pase forzarEnvio:true (ej. protocolo no-show manual).
export async function enviarRespuestaWhatsApp(
  telefono: string,
  bloques: string[],
  opts?: { forzarEnvio?: boolean }
): Promise<void> {
  const modo = await obtenerModo().catch(() => "automatico" as const);

  if (modo === "depuracion" && !opts?.forzarEnvio) {
    void logDebugIA(
      "DEPURACION_WA_INTERCEPTADO",
      `[DEPURACION] ${bloques.length} bloque(s) interceptados — no se envían al lead`,
      { telefono, bloques_count: bloques.length, preview: bloques[0]?.slice(0, 120) }
    );
    return;
  }

  for (const [i, bloque] of bloques.entries()) {
    if (i > 0) await delay(DELAY_MS);
    try {
      await sendTextMessageWithRetry(telefono, bloque);
      void logSistema({
        categoria: "servicio", tipoAccion: "whatsapp-sender.enviar", fase: "ok",
        resultado: `Bloque ${i + 1}/${bloques.length} enviado a ...${telefono.slice(-4)}`,
        metadata: { bloque_index: i, chars: bloque.length, forzarEnvio: opts?.forzarEnvio ?? false },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void logSistema({
        categoria: "servicio", tipoAccion: "whatsapp-sender.enviar", fase: "error",
        resultado: `Retry agotado bloque ${i + 1} — encolando: ${msg}`,
        metadata: { bloque_index: i, telefono },
      });
      await encolarMensaje(telefono, bloque);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
