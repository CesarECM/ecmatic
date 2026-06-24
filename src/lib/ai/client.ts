import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { modeloPorTarea } from "./model-router";
import type { TareaIA } from "./model-router";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const CLAUDE_MODEL    = "claude-sonnet-4-6";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS  = 1536;

export async function generarEmbedding(texto: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texto,
    dimensions: EMBEDDING_DIMS,
  });
  return res.data[0].embedding;
}

// Inserta un registro en log_sistema sin bloquear la ejecución principal.
async function insertLogSistema(row: {
  tipo_accion: string;
  lead_id: string | null;
  fase: string;
  trace_id: string;
  resultado: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createServiceClient() as any).from("log_sistema").insert({
      categoria:   "ia",
      tipo_accion: row.tipo_accion,
      lead_id:     row.lead_id,
      fase:        row.fase,
      trace_id:    row.trace_id,
      resultado:   row.resultado,
      metadata:    row.metadata,
    });
  } catch { /* el log nunca interrumpe la ejecución */ }
}

// Wrapper central: resuelve modelo, emite 3 logs (llamado → peticion → respuesta/timeout/error)
// y aplica un timeout de 60 s a la llamada a Claude.
export async function callClaudeIA(
  tarea: TareaIA,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
  meta?: { leadId?: string; traceId?: string }
): Promise<Anthropic.Message> {
  const model     = modeloPorTarea(tarea);
  const inicio    = Date.now();
  const requestId = randomUUID();
  const leadId    = meta?.leadId ?? null;
  const traceId   = meta?.traceId;

  const systemRaw = typeof params.system === "string" ? params.system : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgs: any[] = Array.isArray(params.messages) ? params.messages : [];
  const charsEst  = systemRaw.length + msgs.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, m: any) => s + (typeof m.content === "string" ? m.content.length : 0), 0
  );

  const traceEffective = traceId ?? requestId;

  // LOG 1 — llamado: contexto recibido antes de enviar a Claude
  void insertLogSistema({
    tipo_accion: tarea, lead_id: leadId,
    fase: "llamado", trace_id: traceEffective,
    resultado: `Llamado recibido: ${tarea}`,
    metadata: {
      model_seleccionado:    model,
      messages_count:        msgs.length,
      system_prompt_extract: systemRaw.slice(0, 500),
      tarea,
      request_id: requestId,
    },
  });

  // LOG 2 — peticion: lo que se envía a la API de Claude
  void insertLogSistema({
    tipo_accion: tarea, lead_id: leadId,
    fase: "peticion", trace_id: traceEffective,
    resultado: `Enviado a Claude`,
    metadata: {
      model,
      max_tokens:      params.max_tokens ?? null,
      chars_total_est: charsEst,
      messages_count:  msgs.length,
      request_id:      requestId,
    },
  });

  let response: Anthropic.Message;
  try {
    response = await Promise.race([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (anthropic.messages.create as any)({ ...params, model }) as Promise<Anthropic.Message>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_60000ms")), 60_000)
      ),
    ]);
  } catch (err) {
    const durMs     = Date.now() - inicio;
    const isTimeout = err instanceof Error && err.message.startsWith("TIMEOUT_");
    // LOG 3 — timeout o error (awaited: garantiza escritura antes de que la función serverless retorne)
    await insertLogSistema({
      tipo_accion: tarea, lead_id: leadId,
      fase: isTimeout ? "timeout" : "error",
      trace_id: traceEffective,
      resultado: isTimeout
        ? `Sin respuesta en ${durMs} ms`
        : (err instanceof Error ? err.message.slice(0, 200) : "Error desconocido"),
      metadata: {
        model, duracion_ms: durMs,
        error_message: err instanceof Error ? err.message : String(err),
        request_id: requestId,
      },
    });
    throw err;
  }

  // LOG 3 — respuesta exitosa (awaited: garantiza escritura antes de que la función serverless retorne)
  await insertLogSistema({
    tipo_accion: tarea, lead_id: leadId,
    fase: "respuesta", trace_id: traceEffective,
    resultado: response.content[0]?.type === "text"
      ? (response.content[0] as { type: "text"; text: string }).text.slice(0, 300)
      : null,
    metadata: {
      model,
      tokens_input:  response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      duracion_ms:   Date.now() - inicio,
      stop_reason:   response.stop_reason,
      request_id:    requestId,
    },
  });

  return response;
}
