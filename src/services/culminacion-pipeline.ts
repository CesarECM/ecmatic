import { createServiceClient } from "@/lib/supabase/service";
import { obtenerPipelinesActivos } from "@/services/pipeline-multi";

const ETAPAS_ORDEN: Record<string, number> = {
  "Nuevo": 1, "Contactado": 2, "Primer contacto": 2,
  "Interesado": 3, "Diagnóstico": 3,
  "Propuesta": 4, "Seguimiento": 4,
  "Negociación": 5, "Decisión": 5,
  "Comprado": 6, "Certificado": 7,
  "Perdido": 0,
};

// S28.7 — Cuando un leadmagnet activa multi-pipeline, evalúa si el pipeline
// de menor etapa entre los activos del lead debe marcarse como culminado.
// Un pipeline se culmina si el lead ya avanzó significativamente en otro pipeline
// que cubre fases CAGC posteriores (avance ≥ 2 niveles).
export async function evaluarCulminacionPorLeadmagnet(
  leadId: string,
  rutaNueva: string
): Promise<void> {
  const supabase = createServiceClient();
  const pipelines = await obtenerPipelinesActivos(leadId);

  if (pipelines.length < 2) return;

  // Ordenar por posición de etapa actual (menor primero)
  const ordenados = [...pipelines].sort(
    (a, b) =>
      (ETAPAS_ORDEN[a.etapa_actual] ?? 0) - (ETAPAS_ORDEN[b.etapa_actual] ?? 0)
  );

  const masAtrasado = ordenados[0];
  const masAvanzado = ordenados[ordenados.length - 1];

  // No culminar si es el mismo pipeline que acaba de abrirse
  if (masAtrasado.ruta === rutaNueva) return;

  const nivelAtrasado = ETAPAS_ORDEN[masAtrasado.etapa_actual] ?? 0;
  const nivelAvanzado = ETAPAS_ORDEN[masAvanzado.etapa_actual] ?? 0;

  // Solo culminar si hay una diferencia de ≥ 2 niveles
  if (nivelAvanzado - nivelAtrasado < 2) return;

  // Marcar el pipeline más atrasado como culminado (inactivo)
  await supabase
    .from("lead_pipelines")
    .update({ activo: false, metadata: { culminado_por: "leadmagnet", at: new Date().toISOString() } })
    .eq("id", masAtrasado.id)
    .throwOnError();

  // Registrar en sugerencias para visibilidad del admin
  await supabase.from("sugerencias_ia").insert({
    tipo: "pipeline",
    titulo: `Pipeline culminado: ${masAtrasado.ruta} (${leadId.slice(0, 8)})`,
    descripcion: `El leadmagnet activó el pipeline "${rutaNueva}" y el lead ya está en "${masAvanzado.etapa_actual}". El pipeline "${masAtrasado.ruta}" en etapa "${masAtrasado.etapa_actual}" fue marcado como culminado automáticamente.`,
    prioridad: "puede_esperar",
    aprobado: true,
    metadata: { lead_id: leadId, pipeline_culminado_id: masAtrasado.id, ruta_nueva: rutaNueva },
  });
}
