const API_URL = "https://api.brevo.com/v3";

function getKey(): string | null {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn("[brevo] BREVO_API_KEY no configurada — operación omitida");
    return null;
  }
  return key;
}

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const key = getKey();
  if (!key) return null;

  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          "api-key": key,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // 204 No Content es éxito sin cuerpo
      if (res.status === 204) return {};
      if (res.ok) return await res.json();

      const err = await res.json().catch(() => ({}));
      throw new Error(`Brevo error ${res.status}: ${JSON.stringify(err)}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < 2) await new Promise((r) => setTimeout(r, 2 ** i * 500));
    }
  }
  throw lastError!;
}

export interface BrevoContactoAtributos {
  NOMBRE?: string;
  TELEFONO?: string;
  PIPELINE_STAGE?: string;
  PIPELINE_RUTA?: string;
  DISC?: string;
  SCORE_SALUD?: number;
}

// Crea o actualiza un contacto en Brevo con sus atributos ECMatic
export async function upsertContacto(
  email: string,
  atributos: BrevoContactoAtributos,
  listaIds?: number[]
): Promise<void> {
  await request("POST", "/contacts", {
    email,
    attributes: atributos,
    listIds: listaIds ?? [],
    updateEnabled: true,
  });
}

// Agrega un contacto a una lista de Brevo (por ID numérico de lista)
export async function agregarALista(email: string, listaId: number): Promise<void> {
  await request("POST", `/contacts/lists/${listaId}/contacts/add`, {
    emails: [email],
  });
}

// Elimina un contacto de una lista de Brevo
export async function eliminarDeLista(email: string, listaId: number): Promise<void> {
  await request("POST", `/contacts/lists/${listaId}/contacts/remove`, {
    emails: [email],
  });
}

// Envía un email desde una plantilla de Brevo (para secuencias avanzadas)
export async function enviarDesdeTemplate(
  email: string,
  templateId: number,
  params: Record<string, string>
): Promise<void> {
  await request("POST", "/smtp/email", {
    to: [{ email }],
    templateId,
    params,
  });
}
