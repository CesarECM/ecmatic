// S19.6 — Detecta señales situacionales en la conversación de un lead.
// Una señal es un dato contextual (evento, fecha, tercero, urgencia)
// que puede cambiar la estrategia de comunicación de la IA.

import { callClaudeIA } from "./client";

export type TipoSenal =
  | "evento"
  | "fecha_limite"
  | "tercero"
  | "urgencia"
  | "situacion_laboral"
  | "otro";

export interface SenalDetectada {
  tipo: TipoSenal;
  descripcion: string;
  fragmento: string;
  confianza: number;
}

const SYSTEM = `Eres un extractor de señales situacionales para un CRM de certificaciones CONOCER (México).
Analiza la conversación y detecta señales contextuales que indiquen:

TIPOS DE SEÑAL:
- evento: auditoría, inspección, concurso, convocatoria, evaluación próxima, reunión clave
- fecha_limite: deadline explícito o implícito ("antes de diciembre", "el mes que entra", "pronto")
- tercero: jefe, empresa, familia o tercero que requiere o influye en la certificación
- urgencia: riesgo inminente de perder trabajo, contrato, licitación o ascenso
- situacion_laboral: cambio de trabajo, promoción, cambio de área, nuevo contrato
- otro: cualquier señal situacional relevante que no encaje en las anteriores

REGLAS:
- Solo incluye señales con evidencia clara en la conversación
- "fragmento" es la cita literal (máx 80 chars) que la evidencia
- "descripcion" explica la señal en una oración corta, en español
- confianza: 0.9+ = señal inequívoca, 0.7–0.9 = señal probable, 0.5–0.7 = señal débil
- Si no hay señales situacionales, devuelve []
- Nunca inventes señales; si no hay evidencia, omite

Responde ÚNICAMENTE con JSON válido (array), sin texto adicional:
[{"tipo":"...","descripcion":"...","fragmento":"...","confianza":0.XX}]`;

export async function detectarSenalesSituacionales(
  mensajes: { direccion: string; contenido: string }[]
): Promise<SenalDetectada[]> {
  if (mensajes.length === 0) return [];

  const dialogo = mensajes
    .slice(-30)
    .map((m) => `[${m.direccion === "entrante" ? "LEAD" : "ECM"}] ${m.contenido}`)
    .join("\n");

  const response = await callClaudeIA("SENALES", {
    max_tokens: 800,
    messages: [
      { role: "user", content: `Conversación:\n${dialogo.slice(0, 5000)}` },
    ],
    system: SYSTEM,
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";

  try {
    const parsed: unknown[] = JSON.parse(raw);
    return parsed
      .filter((s): s is SenalDetectada =>
        typeof s === "object" && s !== null &&
        "tipo" in s && "descripcion" in s && "fragmento" in s && "confianza" in s
      )
      .map((s) => ({
        tipo: s.tipo as TipoSenal,
        descripcion: String(s.descripcion).slice(0, 300),
        fragmento:   String(s.fragmento).slice(0, 120),
        confianza:   Math.min(1, Math.max(0, Number(s.confianza))),
      }));
  } catch {
    return [];
  }
}
