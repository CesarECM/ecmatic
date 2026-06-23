import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { modeloPorTarea } from "./model-router";
import type { TareaIA } from "./model-router";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

export async function generarEmbedding(texto: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texto,
    dimensions: EMBEDDING_DIMS,
  });
  return res.data[0].embedding;
}

// Wrapper central: resuelve modelo, llama a Claude y registra en log_ia (fire-and-forget).
// Sustituye el patrón modeloPorTarea("X") + anthropic.messages.create() en todos los módulos de IA.
export async function callClaudeIA(
  tarea: TareaIA,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
  meta?: { leadId?: string }
): Promise<Anthropic.Message> {
  const model = modeloPorTarea(tarea);
  const inicio = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (anthropic.messages.create as any)({ ...params, model }) as Anthropic.Message;

  void (async () => {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (createServiceClient() as any).from("log_ia").insert({
        tipo_accion: tarea,
        lead_id:     meta?.leadId ?? null,
        resultado:   response.content[0]?.type === "text"
          ? (response.content[0] as { type: "text"; text: string }).text.slice(0, 300)
          : null,
        metadata: {
          modelo:        model,
          tokens_input:  response.usage.input_tokens,
          tokens_output: response.usage.output_tokens,
          duracion_ms:   Date.now() - inicio,
        },
      });
    } catch { /* el log nunca bloquea la ejecución */ }
  })();

  return response;
}
