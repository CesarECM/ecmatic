// S21.2 — Analiza una respuesta IA marcada como "mala" por el admin
// e identifica qué mejorar en KB, matriz nD o comportamiento de pipeline.

import { callClaudeIA } from "./client";

export interface SugerenciaVoto {
  area:        "kb" | "matriz" | "pipeline";
  titulo:      string;
  descripcion: string;
  prioridad:   "urgente" | "importante" | "puede_esperar";
}

interface ContextoVoto {
  respuestaMala:    string;
  preguntaLead:     string;
  comentarioAdmin:  string | null;
  faseCagc:         number | null;
  pipelineStage:    string | null;
  intencion:        string | null;
}

const SYSTEM = `Eres un auditor de calidad de un CRM con IA para certificaciones CONOCER.
El admin marcó una respuesta de la IA como "mala". Tu tarea es diagnosticar la causa raíz
e identificar mejoras concretas en estas tres áreas:

- kb: base de conocimiento (información faltante, incorrecta o ambigua)
- matriz: respuesta combinada por dimensiones (temperamento, objeción, fase del comprador)
- pipeline: comportamiento del flujo (respuesta inadecuada para la etapa actual del lead)

Genera SOLO las sugerencias que tengan causa clara. Si no aplica para un área, no la incluyas.
Máximo 3 sugerencias totales. Responde ÚNICAMENTE en JSON:
{ "sugerencias": [ { "area", "titulo", "descripcion", "prioridad" } ] }`;

export async function analizarVotoNegativo(
  ctx: ContextoVoto
): Promise<SugerenciaVoto[]> {
  const userContent = [
    `RESPUESTA IA (marcada como mala):\n"${ctx.respuestaMala}"`,
    `PREGUNTA DEL LEAD:\n"${ctx.preguntaLead}"`,
    ctx.comentarioAdmin ? `COMENTARIO DEL ADMIN: ${ctx.comentarioAdmin}` : "",
    ctx.faseCagc !== null ? `Fase CAGC del lead: ${ctx.faseCagc}` : "",
    ctx.pipelineStage ? `Etapa pipeline: ${ctx.pipelineStage}` : "",
    ctx.intencion ? `Intención detectada: ${ctx.intencion}` : "",
  ].filter(Boolean).join("\n\n");

  const response = await callClaudeIA("ANALISIS", {
    max_tokens: 500,
    system:     SYSTEM,
    messages:   [{ role: "user", content: userContent }],
  });

  try {
    const texto = (response.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(texto) as { sugerencias: SugerenciaVoto[] };
    return Array.isArray(parsed.sugerencias) ? parsed.sugerencias.slice(0, 3) : [];
  } catch {
    return [];
  }
}
