// S34.8 — CRON domingos 6am: sincroniza pipeline_ab_imagenes → imagenes_servicio
// Recalcula score_conversion, veces_mostrada, veces_respondida por imagen.
import { createServiceClient } from "@/lib/supabase/service";

interface AbImagen {
  imagen_servicio_id: string;
  asignaciones: number;
  respuestas: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function actualizarScoresImagenes(): Promise<{
  actualizadas: number;
}> {
  // Agrupa por imagen: suma asignaciones y respuestas de todos sus tests
  const { data: filas } = await db()
    .from("pipeline_ab_imagenes")
    .select("imagen_servicio_id, asignaciones, respuestas") as { data: AbImagen[] | null };

  if (!filas?.length) return { actualizadas: 0 };

  const porImagen = new Map<string, { mostradas: number; respondidas: number }>();
  for (const f of filas) {
    const prev = porImagen.get(f.imagen_servicio_id) ?? { mostradas: 0, respondidas: 0 };
    porImagen.set(f.imagen_servicio_id, {
      mostradas: prev.mostradas + f.asignaciones,
      respondidas: prev.respondidas + f.respuestas,
    });
  }

  let actualizadas = 0;
  for (const [imagenId, { mostradas, respondidas }] of porImagen) {
    const score_conversion =
      mostradas > 0 ? Math.round((respondidas / mostradas) * 1000) / 1000 : 0;

    await db()
      .from("imagenes_servicio")
      .update({
        veces_mostrada: mostradas,
        veces_respondida: respondidas,
        score_conversion,
      })
      .eq("id", imagenId);

    actualizadas++;
  }

  return { actualizadas };
}
