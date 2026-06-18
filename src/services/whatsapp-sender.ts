import { sendTextMessage } from "@/lib/whatsapp/client";

const DELAY_MS = 1_500;

// S1.5 + S1.6 — Envía bloques con delay simulado entre ellos
export async function enviarRespuestaWhatsApp(
  telefono: string,
  bloques: string[]
): Promise<void> {
  for (const [i, bloque] of bloques.entries()) {
    if (i > 0) await delay(DELAY_MS);
    await sendTextMessage(telefono, bloque);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
