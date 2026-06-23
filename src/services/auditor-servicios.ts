// Orquestador del auditor IA de servicios.
// Siempre se llama fire-and-forget desde servicios.ts.

import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import { auditarServicio } from "@/lib/ai/auditor-servicios";
import type { TipoCambioServicio } from "@/lib/ai/auditor-servicios";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function dispararAuditoria(
  servicioId: string,
  tipoCambio: TipoCambioServicio
): Promise<void> {
  try {
    // Obtener el servicio auditado y el catálogo completo en paralelo
    const [svcRes, catalogoRes] = await Promise.all([
      db().from("servicios").select("*").eq("id", servicioId).single(),
      db().from("servicios").select("id, titulo, contenido").eq("activo", true),
    ]);

    const servicio = svcRes.data;
    const catalogo = catalogoRes.data ?? [];
    if (!servicio) return;

    const sugerencias = await auditarServicio(servicio, catalogo, tipoCambio);
    if (!sugerencias.length) return;

    // Verificar cooldown: no insertar la misma sugerencia (por título) en las últimas 24 h
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recientes } = await db()
      .from("sugerencias_ia")
      .select("titulo")
      .eq("servicio_id", servicioId)
      .eq("categoria", "auditor_servicio")
      .gte("created_at", hace24h);
    const titulosRecientes = new Set((recientes ?? []).map((r: { titulo: string }) => r.titulo));

    for (const sug of sugerencias) {
      if (titulosRecientes.has(sug.titulo)) continue;

      const contenidoCompleto = `${sug.titulo}\n\n${sug.descripcion}\n\nServicios afectados: ${sug.servicio_ids_afectados.join(", ")}`;
      let embedding: number[] | null = null;
      try {
        embedding = await generarEmbedding(contenidoCompleto);
      } catch { /* no bloquear si falla */ }

      await db().from("sugerencias_ia").insert({
        categoria:   "auditor_servicio",
        titulo:      sug.titulo,
        contenido:   sug.descripcion,
        servicio_id: servicioId,
        embedding,
        metadata: {
          accion:               sug.accion,
          urgencia:             sug.urgencia,
          servicio_ids_afectados: sug.servicio_ids_afectados,
          tipo_cambio:          tipoCambio,
        },
      });
    }
  } catch (err) {
    console.error("[auditor-servicios] Error:", err);
  }
}
