// Contexto garantizado de pipeline: servicio FK + protocolo de etapa actual.
// Corre en paralelo con la búsqueda semántica en motor-respuesta.ts.

import { createServiceClient } from "@/lib/supabase/service";
import type { RecursoKB } from "./kb-search";

export interface ProtocoloEtapa {
  nombre: string;
  criterios_salida: string | null;
  plantillas_mensaje: { canal: string; cuerpo: string; variables: string[] }[];
  condiciones_workflow: { si: string; entonces: string }[];
}

export interface ContextoPipeline {
  servicio: RecursoKB | null;
  etapa: ProtocoloEtapa | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// Obtiene el servicio FK del pipeline y el protocolo de la etapa actual.
// Devuelve nulls silenciosamente para leads nuevos (tripwire/premium) o sin pipeline.
export async function obtenerContextoPipeline(
  pipelineRuta: string | null | undefined,
  etapaNombre: string
): Promise<ContextoPipeline> {
  if (!pipelineRuta || pipelineRuta === "tripwire" || pipelineRuta === "premium") {
    return { servicio: null, etapa: null };
  }

  const [pipelineRes, etapaRes] = await Promise.all([
    db().from("pipelines").select("servicio_id").eq("ruta", pipelineRuta).maybeSingle(),
    db()
      .from("pipeline_etapas")
      .select("nombre, criterios_salida, plantillas_mensaje, condiciones_workflow")
      .eq("ruta", pipelineRuta)
      .eq("nombre", etapaNombre)
      .maybeSingle(),
  ]);

  // El servicio_id de pipelines apunta a recursos_conocimiento pero comparte UUID con servicios.
  // Consultamos servicios directamente ya que la migración 43 copió los mismos IDs.
  let servicio: RecursoKB | null = null;
  const servicioId: string | null = pipelineRes.data?.servicio_id ?? null;
  if (servicioId) {
    const { data: svc } = await db()
      .from("servicios")
      .select("id, titulo, contenido, caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es")
      .eq("id", servicioId)
      .eq("activo", true)
      .maybeSingle();
    if (svc) servicio = { ...svc, tipo: "servicio" } as RecursoKB;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ed = etapaRes.data as any;
  const etapa: ProtocoloEtapa | null = ed
    ? {
        nombre:               ed.nombre as string,
        criterios_salida:     (ed.criterios_salida as string | null) ?? null,
        plantillas_mensaje:   (ed.plantillas_mensaje ?? []) as ProtocoloEtapa["plantillas_mensaje"],
        condiciones_workflow: (ed.condiciones_workflow ?? []) as ProtocoloEtapa["condiciones_workflow"],
      }
    : null;

  return { servicio, etapa };
}

export function formatearContextoPipelineParaPrompt(
  ctx: ContextoPipeline,
  etapaNombre: string
): string {
  if (!ctx.etapa && !ctx.servicio) return "";
  const partes: string[] = [];

  if (ctx.etapa) {
    const e = ctx.etapa;
    const lineas = [`\nETAPA ACTUAL DEL PIPELINE: ${etapaNombre}`];
    if (e.criterios_salida)
      lineas.push(`Objetivo para avanzar al siguiente paso: ${e.criterios_salida}`);
    if (e.plantillas_mensaje.length) {
      lineas.push("Plantillas configuradas para esta etapa:");
      e.plantillas_mensaje.forEach(p =>
        lineas.push(`  [${p.canal.toUpperCase()}] ${p.cuerpo}`)
      );
    }
    if (e.condiciones_workflow.length) {
      lineas.push("Reglas de workflow:");
      e.condiciones_workflow.forEach(c =>
        lineas.push(`  Si ${c.si} → entonces ${c.entonces}`)
      );
    }
    partes.push(lineas.join("\n"));
  }

  return partes.join("\n");
}
