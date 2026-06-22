// S33.4 — Auditoría de assets: detecta servicios sin imagen activa por canal.
// Extiende brochures-faltantes. Genera sugerencias tipo_brief='diseno'.
// Cron semanal lunes 8am.

import { createServiceClient } from "@/lib/supabase/service";
import { generarBriefDiseno, type CanalImagen } from "@/lib/ai/brief-diseno";
import { generarEmbedding } from "@/lib/ai/client";

const CANALES: CanalImagen[] = ["whatsapp", "email", "landing"];
const USO_MINIMO = 1;

export interface ResultadoAuditoriaAssets {
  serviciosEvaluados: number;
  assetsFaltantes: number;
  briefsGenerados: number;
  briefsDuplicados: number;
}

export async function ejecutarAuditoriaAssets(): Promise<ResultadoAuditoriaAssets> {
  const supabase = createServiceClient();

  const { data: servicios } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, contenido, score_uso")
    .eq("tipo", "servicio")
    .eq("activo", true)
    .eq("aprobado", true)
    .gte("score_uso", USO_MINIMO)
    .order("score_uso", { ascending: false });

  if (!servicios?.length) {
    return { serviciosEvaluados: 0, assetsFaltantes: 0, briefsGenerados: 0, briefsDuplicados: 0 };
  }

  // Imágenes activas por servicio y canal
  const { data: imagenes } = await (supabase as any)
    .from("imagenes_servicio")
    .select("servicio_id, canal_uso")
    .eq("activa", true);

  const imagenesExistentes = new Set<string>(
    (imagenes ?? []).map((i: { servicio_id: string; canal_uso: string }) =>
      `${i.servicio_id}:${i.canal_uso}`
    )
  );

  // Briefs pendientes para evitar duplicados
  const { data: briefsPendientes } = await (supabase as any)
    .from("sugerencias_ia")
    .select("servicio_id, metadata")
    .is("aprobado", null)
    .eq("tipo_brief", "diseno");

  const briefsExistentes = new Set<string>(
    (briefsPendientes ?? []).map(
      (b: { servicio_id: string | null; metadata: Record<string, unknown> }) =>
        `${b.servicio_id}:${(b.metadata?.canal_uso as string | undefined) ?? ""}`
    )
  );

  let assetsFaltantes = 0;
  let briefsGenerados = 0;
  let briefsDuplicados = 0;

  for (const servicio of servicios as { id: string; titulo: string; contenido: string }[]) {
    for (const canal of CANALES) {
      if (imagenesExistentes.has(`${servicio.id}:${canal}`)) continue;
      assetsFaltantes++;

      if (briefsExistentes.has(`${servicio.id}:${canal}`)) {
        briefsDuplicados++;
        continue;
      }

      const brief = await generarBriefDiseno(servicio.titulo, servicio.contenido ?? "", canal);
      const embedding = await generarEmbedding(
        `${servicio.titulo} — ${canal}: ${brief.concepto_creativo}`
      );

      await (supabase as any).from("sugerencias_ia").insert({
        tipo:        "general",
        tipo_brief:  "diseno",
        titulo:      `Brief de diseño: ${servicio.titulo} (${canal})`,
        descripcion: brief.concepto_creativo,
        prioridad:   "puede_esperar",
        servicio_id: servicio.id,
        embedding,
        metadata:    {
          categoria: "brief_diseno",
          canal_uso: canal,
          brief,
        } satisfies Record<string, unknown>,
      });

      briefsGenerados++;
    }
  }

  return { serviciosEvaluados: servicios.length, assetsFaltantes, briefsGenerados, briefsDuplicados };
}
