// Orquestador del auditor IA de servicios.
// Siempre se llama fire-and-forget desde servicios.ts.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { auditarServicio } from "@/lib/ai/auditor-servicios";
import { logDebugIA } from "@/services/log-ia";
import type { TipoCambioServicio } from "@/lib/ai/auditor-servicios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function dispararAuditoria(
  servicioId: string,
  tipoCambio: TipoCambioServicio
): Promise<void> {
  void logDebugIA("AUDITOR_SERVICIO", `[INICIO] tipoCambio=${tipoCambio} id=${servicioId}`, {
    servicioId, tipoCambio,
  });

  try {
    const [svcRes, catalogoRes] = await Promise.all([
      db().from("servicios").select("*").eq("id", servicioId).single(),
      db().from("servicios").select("id, titulo, contenido").eq("activo", true),
    ]);

    const servicio = svcRes.data;
    const catalogo = catalogoRes.data ?? [];

    if (!servicio) {
      await logDebugIA("AUDITOR_SERVICIO", `[FETCH_ERROR] Servicio ${servicioId} no encontrado en BD`, {
        servicioId, svc_error: svcRes.error?.message,
      }, "error");
      return;
    }

    void logDebugIA("AUDITOR_SERVICIO", `[FETCH_OK] "${servicio.titulo}" | catálogo: ${catalogo.length} servicios`, {
      titulo: servicio.titulo, catalogo_count: catalogo.length,
    });

    const sugerencias = await auditarServicio(servicio, catalogo, tipoCambio);

    void logDebugIA("AUDITOR_SERVICIO", `[IA_OK] ${sugerencias.length} sugerencias retornadas por la IA`, {
      count: sugerencias.length,
      titulos: sugerencias.map(s => s.titulo),
    });

    if (!sugerencias.length) return;

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recientes } = await db()
      .from("sugerencias_ia")
      .select("titulo")
      .eq("servicio_id", servicioId)
      .filter("metadata->>categoria", "eq", "auditor_servicio")
      .gte("created_at", hace24h);
    const titulosRecientes = new Set((recientes ?? []).map((r: { titulo: string }) => r.titulo));

    const nuevas  = sugerencias.filter(s => !titulosRecientes.has(s.titulo));
    const bloqueadas = sugerencias.filter(s => titulosRecientes.has(s.titulo));

    void logDebugIA(
      "AUDITOR_SERVICIO",
      `[COOLDOWN] ${nuevas.length} pasan | ${bloqueadas.length} bloqueadas por 24h`,
      { pasan: nuevas.map(s => s.titulo), bloqueadas: bloqueadas.map(s => s.titulo) },
      nuevas.length === 0 ? "warn" : "debug"
    );

    for (const sug of nuevas) {
      const contenidoCompleto = `${sug.titulo}\n\n${sug.descripcion}\n\nServicios afectados: ${sug.servicio_ids_afectados.join(", ")}`;
      let embedding: number[] | null = null;
      try {
        embedding = await generarEmbedding(contenidoCompleto);
      } catch (embErr) {
        void logDebugIA("AUDITOR_SERVICIO", `[EMBED_WARN] Embedding falló para "${sug.titulo}"`, {
          error: String(embErr), titulo: sug.titulo,
        }, "warn");
      }

      const { error: insertError } = await db().from("sugerencias_ia").insert({
        tipo:        "general",
        titulo:      sug.titulo,
        descripcion: sug.descripcion,
        servicio_id: servicioId,
        embedding,
        metadata: {
          categoria:              "auditor_servicio",
          accion:                 sug.accion,
          urgencia:               sug.urgencia,
          servicio_ids_afectados: sug.servicio_ids_afectados,
          tipo_cambio:            tipoCambio,
        },
      });

      if (insertError) {
        await logDebugIA("AUDITOR_SERVICIO", `[INSERT_ERROR] "${sug.titulo}": ${insertError.message}`, {
          titulo:  sug.titulo,
          code:    insertError.code,
          details: insertError.details,
          hint:    insertError.hint,
          message: insertError.message,
        }, "error");
      } else {
        void logDebugIA("AUDITOR_SERVICIO", `[INSERT_OK] Sugerencia guardada: "${sug.titulo}"`, {
          titulo: sug.titulo, accion: sug.accion, urgencia: sug.urgencia,
        });
      }
    }

  } catch (err) {
    await logDebugIA("AUDITOR_SERVICIO", `[ERROR_FATAL] ${String(err)}`, {
      servicioId, tipoCambio,
      error: String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
    }, "error");
    console.error("[auditor-servicios] Error:", err);
  }
}
