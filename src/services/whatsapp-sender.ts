import { sendTextMessageWithRetry } from "@/lib/whatsapp/client";
import { encolarMensaje } from "@/services/mensajes-cola";

const DELAY_MS = 1_500;

// S1.5 + S1.6 — Envía bloques con delay simulado entre ellos.
// Fast-path: retry exponencial directo. Fallback: encola en DB si falla.
export async function enviarRespuestaWhatsApp(
  telefono: string,
  bloques: string[]
): Promise<void> {
  for (const [i, bloque] of bloques.entries()) {
    if (i > 0) await delay(DELAY_MS);
    try {
      await sendTextMessageWithRetry(telefono, bloque);
    } catch (err) {
      console.error("[whatsapp-sender] retry agotado, encolando:", err);
      await encolarMensaje(telefono, bloque);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
