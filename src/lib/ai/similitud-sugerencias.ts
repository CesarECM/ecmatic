// S33.6 — Auto-aprobación en cascada por similitud coseno.
// Al aprobar una sugerencia, auto-aprueba las pendientes que superen el umbral.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "./client";

function coseno(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA > 0 && magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

async function obtenerUmbral(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data } = await (supabase as any)
    .from("configuracion_sistema")
    .select("metadata")
    .single();
  return (data?.metadata?.umbral_autoaprobacion as number | undefined) ?? 0.90;
}

async function asegurarEmbedding(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  titulo: string,
  descripcion: string
): Promise<number[] | null> {
  const { data } = await (supabase as any)
    .from("sugerencias_ia")
    .select("embedding")
    .eq("id", id)
    .single();

  if (data?.embedding) return data.embedding as number[];

  const embedding = await generarEmbedding(`${titulo}\n${descripcion}`);
  await (supabase as any).from("sugerencias_ia").update({ embedding }).eq("id", id);
  return embedding;
}

// Llamar fire-and-forget desde aprobarSugerenciaAction tras aprobar.
export async function autoAprobarSimilares(
  idAprobada: string,
  titulo: string,
  descripcion: string
): Promise<number> {
  const supabase = createServiceClient();
  const umbral = await obtenerUmbral(supabase);

  const embeddingAprobada = await asegurarEmbedding(supabase, idAprobada, titulo, descripcion);
  if (!embeddingAprobada) return 0;

  const { data: pendientes } = await (supabase as any)
    .from("sugerencias_ia")
    .select("id, embedding, titulo, descripcion")
    .is("aprobado", null)
    .neq("id", idAprobada)
    .not("embedding", "is", null);

  if (!pendientes?.length) return 0;

  let autoaprobadas = 0;
  for (const p of pendientes as { id: string; embedding: number[] }[]) {
    const sim = coseno(embeddingAprobada, p.embedding);
    if (sim >= umbral) {
      await (supabase as any)
        .from("sugerencias_ia")
        .update({ aprobado: true, metadata: { autoaprobada: true, sim_score: sim } })
        .eq("id", p.id);
      autoaprobadas++;
    }
  }

  return autoaprobadas;
}
