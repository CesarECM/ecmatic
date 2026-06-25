// Búsqueda híbrida de leads: keyword (50%) + semántica pgvector (50%).
// Basado en el patrón unifiedSearch de NextCRM, adaptado al schema de ECMatic.
// El campo `contexto` es el más valioso para búsqueda semántica —
// contiene el resumen de la conversación del lead.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { buildEmbeddingText, computeContentHash } from "@/lib/ai/embedding-utils";

export interface LeadSearchResult {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  pipeline_stage: string;
  canal_origen: string;
  vendedor_id: string | null;
  score_salud: number;
  activo: boolean;
  archivado: boolean;
  score: number;
  matchType: "keyword" | "semantic" | "both";
}

function mergeResultados(
  keywordIds: Set<string>,
  semanticMap: Map<string, number>,
  todos: Omit<LeadSearchResult, "score" | "matchType">[],
): LeadSearchResult[] {
  return todos
    .map((r) => {
      const enKeyword = keywordIds.has(r.id);
      const simScore  = semanticMap.get(r.id) ?? 0;
      const score     = 0.5 * (enKeyword ? 1.0 : 0) + 0.5 * simScore;
      const matchType: LeadSearchResult["matchType"] =
        enKeyword && simScore > 0 ? "both" : enKeyword ? "keyword" : "semantic";
      return { ...r, score, matchType };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export async function buscarLeads(query: string): Promise<LeadSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  // Embedding — si falla, continúa solo con keyword
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generarEmbedding(query.trim());
  } catch {
    console.warn("[leads-search] embedding falló — solo búsqueda por texto");
  }

  const camposBase = "id, nombre, telefono, email, pipeline_stage, canal_origen, vendedor_id, score_salud, activo, archivado";

  // Búsqueda keyword — nombre, teléfono, email, stage, contexto
  const { data: kwData } = await db
    .from("leads")
    .select(camposBase)
    .or([
      `nombre.ilike.%${query}%`,
      `telefono.ilike.%${query}%`,
      `email.ilike.%${query}%`,
      `pipeline_stage.ilike.%${query}%`,
      `contexto.ilike.%${query}%`,
    ].join(","))
    .eq("activo", true)
    .limit(20);

  const kwLeads = (kwData ?? []) as Omit<LeadSearchResult, "score" | "matchType">[];
  const kwIds   = new Set(kwLeads.map((r) => r.id));

  // Búsqueda semántica vía RPC
  let semLeads: { id: string; similitud: number }[] = [];
  if (queryEmbedding) {
    const { data: semData } = await db.rpc("buscar_leads", {
      query_embedding: queryEmbedding,
      limite: 20,
      umbral: 0.30,
    });
    semLeads = (semData ?? []) as { id: string; similitud: number }[];
  }
  const semMap = new Map(semLeads.map((r) => [r.id, Number(r.similitud)]));

  // Fetch filas semánticas que no salieron en keyword
  const soloSemIds = semLeads.map((r) => r.id).filter((id) => !kwIds.has(id));
  let extraLeads: Omit<LeadSearchResult, "score" | "matchType">[] = [];
  if (soloSemIds.length > 0) {
    const { data: extraData } = await db
      .from("leads")
      .select(camposBase)
      .in("id", soloSemIds);
    extraLeads = (extraData ?? []) as Omit<LeadSearchResult, "score" | "matchType">[];
  }

  return mergeResultados(kwIds, semMap, [...kwLeads, ...extraLeads]);
}

// Genera y persiste el embedding de un lead.
// Usa hash SHA-256 para saltarse el update si el texto no cambió.
export async function indexarLead(leadId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  const { data: lead } = await db
    .from("leads")
    .select("nombre, telefono, email, pipeline_stage, canal_origen, contexto, metadata, embedding_hash")
    .eq("id", leadId)
    .single();

  if (!lead) return;

  const meta = (lead.metadata as Record<string, unknown>) ?? {};
  const texto = buildEmbeddingText([
    lead.nombre,
    lead.pipeline_stage,
    lead.canal_origen,
    lead.contexto,
    meta.empresa as string,
    meta.cargo as string,
  ]);

  if (!texto) return;

  const hash = computeContentHash(texto);

  // Skip si el contenido no cambió
  if (lead.embedding_hash === hash) return;

  const embedding = await generarEmbedding(texto);

  await db
    .from("leads")
    .update({
      embedding:            embedding,
      embedding_hash:       hash,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
}
