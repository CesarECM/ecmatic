import { generarEmbedding } from "@/lib/ai/client";
import { createServiceClient } from "@/lib/supabase/service";

interface KbRow {
  tipo:            string;
  contenido:       string;
  score_confianza: number;
}

// Genera embedding del contenido y lo persiste en v2_kb_items.
// Llamar via after() al aprobar o editar un item KB.
export async function generarYGuardarEmbedding(id: string): Promise<void> {
  const db = createServiceClient() as any;
  const { data } = await db
    .from("v2_kb_items")
    .select("contenido")
    .eq("id", id)
    .single();
  if (!data?.contenido) return;
  const embedding = await generarEmbedding(data.contenido as string);
  await db.from("v2_kb_items").update({ embedding }).eq("id", id);
}

// Búsqueda semántica en v2_kb_items (estado='aprobado').
// Fallback a top-N por score_confianza cuando no hay embeddings disponibles aún.
// Muestreo forzado ~1/50: appends un item no validado recientemente para evitar
// que items descuidados desaparezcan sin ser vistos nunca en contexto (S150.3).
export async function buscarKbV2(query: string, limite = 8): Promise<KbRow[]> {
  const db = createServiceClient() as any;
  let resultados: KbRow[] = [];

  try {
    const embedding = await generarEmbedding(query);
    const { data } = await db.rpc("buscar_v2_kb_items", {
      query_embedding: embedding,
      limite,
      umbral: 0.50,
    });
    if ((data as KbRow[] | null)?.length) resultados = data as KbRow[];
  } catch { /* fallback */ }

  if (!resultados.length) {
    const { data: fallback } = await db
      .from("v2_kb_items")
      .select("tipo, contenido, score_confianza")
      .eq("estado", "aprobado")
      .order("score_confianza", { ascending: false })
      .limit(limite);
    resultados = (fallback ?? []) as KbRow[];
  }

  // Exploración ~2%: surface un item descuidado (sin validar en 30+ días)
  if (Math.random() < 0.02 && resultados.length > 0) {
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: muestra } = await db
      .from("v2_kb_items")
      .select("tipo, contenido, score_confianza")
      .eq("estado", "aprobado")
      .lt("ultima_validacion", hace30)
      .order("score_confianza", { ascending: true })
      .limit(1);
    if (muestra?.[0]) resultados.push(muestra[0] as KbRow);
  }

  return resultados;
}
