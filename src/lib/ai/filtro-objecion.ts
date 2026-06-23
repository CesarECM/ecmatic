import { callClaudeIA } from "./client";
import { registrarUsoIA } from "@/services/alertas-ia";
import type { TipoResistencia } from "@/lib/supabase/types";

export interface ResultadoFiltro {
  tipo: TipoResistencia;
  confianza: number; // 0–1
}

// S31.4 — Capa 2: distingue si la resistencia es una Condición real o una Objeción trabajable
// Condición = razón real para no comprar (no se trabaja, se acepta con respeto)
// Objeción  = resistencia disfrazada que oculta un miedo más profundo (sí se trabaja)
export async function filtrarResistencia(
  mensajes: string[],
  historial: string
): Promise<ResultadoFiltro> {
  const response = await callClaudeIA("OBJECION", {
    max_tokens: 20,
    system: `Eres un experto en psicología de ventas.
Clasifica la resistencia del lead como CONDICION u OBJECION.

CONDICION: razón real e inmovible para no comprar ahora (sin empleo actual, duelo familiar, enfermedad grave, restricción legal).
OBJECION: resistencia disfrazada que esconde miedo o desconfianza (precio "muy caro", "lo voy a pensar", "no tengo tiempo").

Responde SOLO con: CONDICION o OBJECION`,
    messages: [{
      role: "user",
      content: `HISTORIAL:\n${historial || "(sin historial)"}\n\nMENSAJE DEL LEAD:\n${mensajes.join("\n")}\n\n¿Es CONDICION u OBJECION?`,
    }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  const raw = (response.content[0] as { text: string }).text.trim().toUpperCase();
  const tipo: TipoResistencia = raw.startsWith("COND") ? "condicion" : "objecion";

  return { tipo, confianza: 0.85 };
}
