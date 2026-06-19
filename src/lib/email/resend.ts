import { Resend } from "resend";

const FROM = "Centro ECM <no-reply@ceecm.mx>";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY no configurada — emails desactivados");
    return null;
  }
  return new Resend(key);
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
}

// Envía un email con reintentos exponenciales (máx 3 intentos)
export async function enviarEmail(payload: EmailPayload): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await client.emails.send({ from: FROM, ...payload });
    if (!error && data) return data.id;
    lastError = new Error(error?.message ?? "Error desconocido de Resend");
    if (i < 2) await new Promise((r) => setTimeout(r, 2 ** i * 500));
  }
  throw lastError!;
}
