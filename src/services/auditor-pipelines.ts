import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { auditarPipeline } from "@/lib/ai/auditor-pipelines-ia";
import { listarEtapasAdmin } from "@/services/etapas-admin";
import { logDebugIA } from "@/services/log-ia";
import type { TipoCambioPipeline } from "@/lib/ai/auditor-pipelines-ia";

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServiceClient() as any;
}

export async function dispararAuditoriaPipeline(
  pipelineRuta: string,
  tipoCambio: TipoCambioPipeline
): Promise<void> {
  void logDebugIA("AUDITOR_PIPELINE", `[INICIO] tipoCambio=${tipoCambio} ruta=${pipelineRuta}`, {
    pipelineRuta, tipoCambio,
  });

  try {
    const [pipelineRes, etapas] = await Promise.all([
      db().from("pipelines").select("*").eq("ruta", pipelineRuta).single(),
      listarEtapasAdmin(pipelineRuta),
    ]);

    const pipeline = pipelineRes.data;

    if (!pipeline) {
      await logDebugIA("AUDITOR_PIPELINE", `[FETCH_ERROR] Pipeline "${pipelineRuta}" no encontrado`, {
        pipelineRuta, db_error: pipelineRes.error?.message,
      }, "error");
      return;
    }

    void logDebugIA("AUDITOR_PIPELINE", `[FETCH_OK] "${pipeline.nombre}" | ${etapas.length} etapas`, {
      nombre: pipeline.nombre, etapas_count: etapas.length, tipo: pipeline.tipo,
    });

    const sugerencias = await auditarPipeline(pipeline, etapas, tipoCambio);

    void logDebugIA("AUDITOR_PIPELINE", `[IA_OK] ${sugerencias.length} sugerencias retornadas`, {
      count: sugerencias.length,
      titulos: sugerencias.map(s => s.titulo),
    });

    if (!sugerencias.length) return;

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recientes } = await db()
      .from("sugerencias_ia")
      .select("titulo")
      .filter("metadata->>categoria", "eq", "auditor_pipeline")
      .gte("created_at", hace24h);
    const titulosRecientes = new Set((recientes ?? []).map((r: { titulo: string }) => r.titulo));

    const nuevas    = sugerencias.filter(s => !titulosRecientes.has(s.titulo));
    const bloqueadas = sugerencias.filter(s => titulosRecientes.has(s.titulo));

    void logDebugIA(
      "AUDITOR_PIPELINE",
      `[COOLDOWN] ${nuevas.length} pasan | ${bloqueadas.length} bloqueadas por 24h`,
      { pasan: nuevas.map(s => s.titulo), bloqueadas: bloqueadas.map(s => s.titulo) },
      nuevas.length === 0 ? "warn" : "debug"
    );

    for (const sug of nuevas) {
      const contenidoCompleto = `${sug.titulo}\n\n${sug.descripcion}\nPipeline: ${sug.pipeline_ruta}${sug.etapa_nombre ? ` · Etapa: ${sug.etapa_nombre}` : ""}`;
      let embedding: number[] | null = null;
      try {
        embedding = await generarEmbedding(contenidoCompleto);
      } catch (embErr) {
        void logDebugIA("AUDITOR_PIPELINE", `[EMBED_WARN] Embedding falló para "${sug.titulo}"`, {
          error: String(embErr), titulo: sug.titulo,
        }, "warn");
      }

      // pipeline_ruta siempre viene del parámetro real — no de Claude (Claude puede generarlo mal)
      const { error: insertError } = await db().from("sugerencias_ia").insert({
        tipo:        "general",
        titulo:      sug.titulo,
        descripcion: sug.descripcion,
        servicio_id: pipeline.servicio_id ?? null,
        embedding,
        metadata: {
          categoria:     "auditor_pipeline",
          accion:        sug.accion,
          urgencia:      sug.urgencia,
          pipeline_ruta: pipelineRuta,
          etapa_nombre:  sug.etapa_nombre ?? null,
          tipo_cambio:   tipoCambio,
          claude_ruta:   sug.pipeline_ruta,
        },
      });

      if (insertError) {
        await logDebugIA("AUDITOR_PIPELINE", `[INSERT_ERROR] "${sug.titulo}": ${insertError.message}`, {
          titulo:  sug.titulo,
          code:    insertError.code,
          details: insertError.details,
          hint:    insertError.hint,
          message: insertError.message,
        }, "error");
      } else {
        void logDebugIA("AUDITOR_PIPELINE", `[INSERT_OK] "${sug.titulo}" | pipeline_ruta=${pipelineRuta}`, {
          titulo: sug.titulo, accion: sug.accion, urgencia: sug.urgencia,
          pipeline_ruta: pipelineRuta, claude_ruta_original: sug.pipeline_ruta,
        });
      }
    }

  } catch (err) {
    await logDebugIA("AUDITOR_PIPELINE", `[ERROR_FATAL] ${String(err)}`, {
      pipelineRuta, tipoCambio,
      error: String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
    }, "error");
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
