// Búsqueda semántica en la base de conocimiento y utilidades de formateo/scoring.
// Extraído de motor-respuesta.ts para respetar el límite de 300 líneas por archivo.

import { generarEmbedding } from "./client";
import { createServiceClient } from "@/lib/supabase/service";

export interface RecursoKB {
  id: string; tipo: string; titulo: string; contenido: string;
  caracteristicas?: string | null; beneficios?: string | null;
  ventajas?: string | null; para_quien_es?: string | null; para_quien_no_es?: string | null;
}

// Pools independientes: servicios y KB nunca compiten por el mismo límite.
export interface ResultadosBusqueda {
  servicios: RecursoKB[];
  kb: RecursoKB[];
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

// Pools independientes: cada uno obtiene hasta limitePorPool resultados propios.
// Servicios y FAQs ya no compiten — ambos siempre están representados.
export async function buscarRecursos(query: string, limitePorPool = 3): Promise<ResultadosBusqueda> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const embedding = await generarEmbedding(query);

  const [kbRes, svcRes] = await Promise.all([
    supabase.rpc("buscar_recursos",   { query_embedding: embedding, limite: limitePorPool, umbral: 0.65 }),
    supabase.rpc("buscar_servicios",  { query_embedding: embedding, limite: limitePorPool, umbral: 0.65 }),
  ]);

  let servicios = (svcRes.data ?? []) as RecursoKB[];

  // Fallback de texto: nombres de marca propios no embedan bien — si el vector search
  // no encuentra nada, buscar por palabras del query en titulo y contenido.
  if (servicios.length === 0) {
    const palabras = query.trim().split(/\s+/).filter(p => p.length > 3);
    if (palabras.length > 0) {
      const orClause = palabras.flatMap(p =>
        [`titulo.ilike.%${p}%`, `contenido.ilike.%${p}%`, `caracteristicas.ilike.%${p}%`]
      ).join(",");
      const { data: textData } = await supabase
        .from("servicios")
        .select("id, titulo, contenido, caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es")
        .eq("activo", true).eq("aprobado", true)
        .or(orClause)
        .limit(limitePorPool);
      if (textData?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        servicios = (textData as any[]).map(r => ({ ...r, tipo: "servicio" }));
      }
    }
  }

  return {
    servicios,
    kb: (kbRes.data ?? []) as RecursoKB[],
  };
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
