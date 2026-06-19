// SmartBuilderEC API client — graceful-off si faltan credenciales

const API_URL = process.env.SMARTBUILDER_API_URL;
const API_KEY = process.env.SMARTBUILDER_API_KEY;

export function isConfigured(): boolean {
  return !!(API_URL && API_KEY);
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T | null> {
  if (!isConfigured()) {
    console.warn("[smartbuilder] API no configurada — operación omitida");
    return null;
  }

  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return await res.json() as T;
      const err = await res.text();
      throw new Error(`SmartBuilderEC ${res.status}: ${err}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < 2) await new Promise((r) => setTimeout(r, 2 ** i * 600));
    }
  }
  throw lastError!;
}

export interface CandidatoSBC {
  nombre: string;
  email: string;
  telefono?: string;
  estandares: string[];
}

// S9.1 — Crea el acceso del candidato en SmartBuilderEC
export async function crearCandidato(candidato: CandidatoSBC): Promise<{ candidato_id: string } | null> {
  return request<{ candidato_id: string }>("POST", "/candidatos", candidato);
}

// S9.2 — Consulta el avance del candidato (0-100)
export async function obtenerProgreso(candidatoId: string): Promise<{ porcentaje: number; datos: unknown } | null> {
  return request<{ porcentaje: number; datos: unknown }>("GET", `/candidatos/${candidatoId}/progreso`);
}
