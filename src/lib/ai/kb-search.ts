// Búsqueda semántica en la base de conocimiento y utilidades de formateo/scoring.
// Extraído de motor-respuesta.ts para respetar el límite de 300 líneas por archivo.

import { generarEmbedding } from "./client";
import { createServiceClient } from "@/lib/supabase/service";

export interface RecursoKB {
  id: string; tipo: string; titulo: string; contenido: string;
  caracteristicas?: string | null; beneficios?: string | null;
  ventajas?: string | null; para_quien_es?: string | null; para_quien_no_es?: string | null;
}

// S22.5 — Formato enriquecido para recursos tipo servicio
export function formatearRecursoKB(r: RecursoKB): string {
  if (r.tipo !== "servicio") return `[${r.tipo.toUpperCase()}] ${r.titulo}:\n${r.contenido}`;
  const partes = [`[SERVICIO] ${r.titulo}:\n${r.contenido}`];
  if (r.caracteristicas) partes.push(`Características: ${r.caracteristicas}`);
  if (r.beneficios)      partes.push(`Beneficios: ${r.beneficios}`);
  if (r.ventajas)        partes.push(`Ventajas: ${r.ventajas}`);
  if (r.para_quien_es)   partes.push(`Ideal para: ${r.para_quien_es}`);
  if (r.para_quien_no_es) partes.push(`NO recomendado para: ${r.para_quien_no_es}`);
  return partes.join("\n");
}

// S1.4 — Búsqueda semántica con pgvector
export async function buscarRecursos(query: string, limite = 4): Promise<RecursoKB[]> {
  const supabase = createServiceClient();
  const embedding = await generarEmbedding(query);
  const { data } = await supabase.rpc("buscar_recursos", {
    query_embedding: embedding,
    limite,
    umbral: 0.65,
  });
  return (data ?? []) as RecursoKB[];
}

// Score heurístico de confianza: recursos KB y matriz elevan; frases de incertidumbre bajan.
export function calcularScore(
  recursos: { id: string }[],
  sugerenciaMatriz: string | null,
  texto: string
): number {
  const INDICADORES = ["no tengo información", "no puedo ayudarte", "no sé", "un asesor", "te contactará", "fuera de mi alcance"];
  let score = Math.min(0.85, 0.30 + recursos.length * 0.18);
  if (sugerenciaMatriz) score += 0.10;
  if (INDICADORES.some((i) => texto.toLowerCase().includes(i))) score -= 0.30;
  return Math.max(0, Math.min(1, score));
}
