import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { auditarPipeline } from "@/lib/ai/auditor-pipelines-ia";
import { listarEtapasAdmin } from "@/services/etapas-admin";
import type { TipoCambioPipeline } from "@/lib/ai/auditor-pipelines-ia";

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServiceClient() as any;
}

export async function dispararAuditoriaPipeline(
  pipelineRuta: string,
  tipoCambio: TipoCambioPipeline
): Promise<void> {
  try {
    const [pipelineRes, etapas] = await Promise.all([
      db().from("pipelines").select("*").eq("ruta", pipelineRuta).single(),
      listarEtapasAdmin(pipelineRuta),
    ]);

    const pipeline = pipelineRes.data;
    if (!pipeline) return;

    const sugerencias = await auditarPipeline(pipeline, etapas, tipoCambio);
    if (!sugerencias.length) return;

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recientes } = await db()
      .from("sugerencias_ia")
      .select("titulo")
      .filter("metadata->>categoria", "eq", "auditor_pipeline")
      .gte("created_at", hace24h);
    const titulosRecientes = new Set((recientes ?? []).map((r: { titulo: string }) => r.titulo));

    for (const sug of sugerencias) {
      if (titulosRecientes.has(sug.titulo)) continue;

      const contenidoCompleto = `${sug.titulo}\n\n${sug.descripcion}\nPipeline: ${sug.pipeline_ruta}${sug.etapa_nombre ? ` · Etapa: ${sug.etapa_nombre}` : ""}`;
      let embedding: number[] | null = null;
      try {
        embedding = await generarEmbedding(contenidoCompleto);
      } catch { /* no bloquear */ }

      await db().from("sugerencias_ia").insert({
        tipo:        "general",
        titulo:      sug.titulo,
        descripcion: sug.descripcion,
        servicio_id: pipeline.servicio_id ?? null,
        embedding,
        metadata: {
          categoria:     "auditor_pipeline",
          accion:        sug.accion,
          urgencia:      sug.urgencia,
          pipeline_ruta: sug.pipeline_ruta,
          etapa_nombre:  sug.etapa_nombre ?? null,
          tipo_cambio:   tipoCambio,
        },
      });
    }
  } catch (err) {
    console.error("[auditor-pipelines] Error:", err);
  }
}

// Escaneo global — llamado por el CRON semanal
export async function scanGlobalPipelines(): Promise<void> {
  const { data: pipelines } = await db()
    .from("pipelines")
    .select("ruta")
    .eq("activo", true);

  for (const p of pipelines ?? []) {
    await dispararAuditoriaPipeline(p.ruta, "scan_global").catch(console.error);
  }
}
