import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Instancias singleton — agnóstico por módulo
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
