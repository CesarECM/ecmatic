import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";
import type { TipoDesconfianza } from "@/lib/supabase/types";

export interface ResultadoDesconfianza {
  tipo: TipoDesconfianza;
  evidencia: string; // fragmento del mensaje que revela la desconfianza
}

// S31.5 — Capa 3: mapea la objeción a una de las Tres Desconfianzas Raíz
// empresa    = duda de la institución, del Centro ECM, de la certificación en sí
// profesional = duda del asesor/vendedor, de la persona que lo atiende
// propia      = el lead duda de sí mismo (no se cree capaz, no se siente merecedor)
export async function identificarDesconfianza(
  mensajes: string[],
  historial: string
): Promise<ResultadoDesconfianza> {
  const response = await anthropic.messages.create({
    model: modeloPorTarea("DESCONFIANZA"),
    max_tokens: 80,
    system: `Eres experto en psicología de ventas consultiva.
Identifica cuál de las Tres Desconfianzas Raíz está presente en el mensaje del lead.

EMPRESA: duda de la institución, el centro, la certificación o el proceso ("¿son legítimos?", "¿para qué sirve esto?", "no conozco CONOCER").
PROFESIONAL: duda del asesor o vendedor ("¿tú qué sabes?", "no me parece serio", "solo me quieren vender").
PROPIA: el lead duda de sí mismo ("no creo poder", "no soy bueno para eso", "no tengo el nivel").

Responde SOLO en JSON: {"tipo": "empresa"|"profesional"|"propia", "evidencia": "fragmento exacto del mensaje"}`,
    messages: [{
      role: "user",
      content: `HISTORIAL:\n${historial || "(sin historial)"}\n\nMENSAJE:\n${mensajes.join("\n")}\n\n¿Cuál es la desconfianza raíz?`,
    }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  try {
    const texto = (response.content[0] as { text: string }).text.trim();
    const json = JSON.parse(texto.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      tipo?: string;
      evidencia?: string;
    };
    const tipos: TipoDesconfianza[] = ["empresa", "profesional", "propia"];
    const tipo = tipos.includes(json.tipo as TipoDesconfianza) ? (json.tipo as TipoDesconfianza) : "empresa";
    return { tipo, evidencia: json.evidencia ?? "" };
  } catch {
    return { tipo: "empresa", evidencia: "" };
  }
}
