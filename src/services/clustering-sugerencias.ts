// S33.8 — Clustering de sugerencias por similitud coseno.
// CRON diario 4am: agrupa sugerencias pendientes sin cluster,
// crea/actualiza clusters_sugerencias y asigna cluster_id.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding, callClaudeIA } from "@/lib/ai/client";

const UMBRAL_CLUSTER = 0.85;

function coseno(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA > 0 && magB > 0 ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

async function generarTituloCluster(titulos: string[]): Promise<string> {
  const res = await callClaudeIA("CLUSTERING", {
    max_tokens: 80,
    messages: [{
      role: "user",
      content: `Resume en 5-8 palabras el tema común de estas sugerencias:\n${titulos.slice(0, 5).join("\n")}`,
    }],
  });
  return (res.content[0] as { text: string }).text.trim().replace(/^["']|["']$/g, "");
}

export interface ResultadoClustering {
  procesadas: number;
  clustersNuevos: number;
  clustersActualizados: number;
}

interface ItemPendiente {
  id: string;
  titulo: string;
  descripcion: string;
  embedding: number[] | null;
}

export async function ejecutarClustering(): Promise<ResultadoClustering> {
  const supabase = createServiceClient();

  const { data: sinCluster } = await (supabase as any)
    .from("sugerencias_ia")
    .select("id, titulo, descripcion, embedding")
    .is("aprobado", null)
    .is("cluster_id", null);

  if (!(sinCluster as ItemPendiente[] | null)?.length) {
    return { procesadas: 0, clustersNuevos: 0, clustersActualizados: 0 };
  }

  // Asegurar embeddings en todos los ítems
  const items: (ItemPendiente & { embedding: number[] })[] = [];
  for (const s of sinCluster as ItemPendiente[]) {
    let emb = s.embedding;
    if (!emb) {
      emb = await generarEmbedding(`${s.titulo}\n${s.descripcion}`);
      await (supabase as any).from("sugerencias_ia").update({ embedding: emb }).eq("id", s.id);
    }
    items.push({ ...s, embedding: emb });
  }

  // Greedy clustering: cada ítem se asigna al primer cluster con sim >= umbral
  // centroide = primer ítem del cluster
  const centroides: { clusterId: string; embedding: number[]; titulos: string[] }[] = [];
  const asignaciones: { id: string; clusterId: string }[] = [];

  for (const item of items) {
    let mejorClusterId: string | null = null;
    let mejorSim = 0;

    for (const c of centroides) {
      const sim = coseno(item.embedding, c.embedding);
      if (sim >= UMBRAL_CLUSTER && sim > mejorSim) {
        mejorSim = sim;
        mejorClusterId = c.clusterId;
      }
    }

    if (mejorClusterId) {
      asignaciones.push({ id: item.id, clusterId: mejorClusterId });
      centroides.find((c) => c.clusterId === mejorClusterId)!.titulos.push(item.titulo);
    } else {
      // Crear nuevo cluster con el título del ítem como placeholder
      const { data: nuevo } = await (supabase as any)
        .from("clusters_sugerencias")
        .insert({ titulo_generado: item.titulo, conteo: 1 })
        .select("id")
        .single();

      if (nuevo?.id) {
        centroides.push({ clusterId: nuevo.id, embedding: item.embedding, titulos: [item.titulo] });
        asignaciones.push({ id: item.id, clusterId: nuevo.id });
      }
    }
  }

  // Aplicar asignaciones en bulk
  for (const { id, clusterId } of asignaciones) {
    await (supabase as any).from("sugerencias_ia").update({ cluster_id: clusterId }).eq("id", id);
  }

  // Actualizar títulos y conteos de clusters con ≥2 ítems
  let clustersNuevos = 0;
  let clustersActualizados = 0;

  for (const c of centroides) {
    if (c.titulos.length >= 2) {
      const titulo = await generarTituloCluster(c.titulos);
      await (supabase as any)
        .from("clusters_sugerencias")
        .update({ titulo_generado: titulo, conteo: c.titulos.length })
        .eq("id", c.clusterId);
      clustersActualizados++;
    } else {
      clustersNuevos++;
    }
  }

  return { procesadas: items.length, clustersNuevos, clustersActualizados };
}
