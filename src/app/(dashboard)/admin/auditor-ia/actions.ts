"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export type TipoAuditoria = "servicio" | "pipeline" | "etapa" | "kb" | "lead";

export interface SugerenciaPanel {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: string;
  created_at: string;
  aprobado: boolean | null;
  metadata: Record<string, unknown>;
}

export interface EstadoAuditoria {
  tipo: TipoAuditoria;
  ultima_auditoria_at: string | null;
  sugerencias_pendientes: SugerenciaPanel[];
  historial_reciente: SugerenciaPanel[];
  proxima_revision_label: string;
  datos_lead?: {
    score_salud: number;
    contexto_updated_at: string | null;
    setter_fase_actual: number | null;
    setter_calificado: boolean | null;
    pipeline_stage: string;
  };
  protocolo_etapa?: {
    tipo_protocolo: "ia-propuesto" | "manual";
    regla_avance: string | null;
    regla_retroceso: string | null;
    regla_espera: string | null;
    updated_at: string | null;
  };
}

const PROXIMA_REVISION: Record<TipoAuditoria, string> = {
  servicio: "Al editar el servicio (disparo automático)",
  pipeline: "Domingos 7am — auditoría global de pipelines",
  etapa:    "Martes 9am — protocolo de etapas",
  kb:       "Lunes 7am — calidad de base de conocimiento",
  lead:     "En cada mensaje recibido · Score de salud domingos 4am",
};

export async function obtenerEstadoAuditoriaAction(
  tipo: TipoAuditoria,
  id: string
): Promise<EstadoAuditoria> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const base: EstadoAuditoria = {
    tipo,
    ultima_auditoria_at: null,
    sugerencias_pendientes: [],
    historial_reciente: [],
    proxima_revision_label: PROXIMA_REVISION[tipo],
  };

  if (tipo === "servicio" || tipo === "kb") {
    const { data } = await db
      .from("sugerencias_ia")
      .select("id, titulo, contenido, prioridad, created_at, aprobado, metadata")
      .eq("servicio_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    const items = (data ?? []) as SugerenciaPanel[];
    return {
      ...base,
      ultima_auditoria_at: items[0]?.created_at ?? null,
      sugerencias_pendientes: items.filter((i) => i.aprobado === null),
      historial_reciente: items.filter((i) => i.aprobado !== null).slice(0, 3),
    };
  }

  if (tipo === "pipeline") {
    const { data } = await db
      .from("sugerencias_ia")
      .select("id, titulo, contenido, prioridad, created_at, aprobado, metadata")
      .eq("categoria", "auditor_pipeline")
      .filter("metadata->>pipeline_ruta", "eq", id)
      .order("created_at", { ascending: false })
      .limit(20);
    const items = (data ?? []) as SugerenciaPanel[];
    return {
      ...base,
      ultima_auditoria_at: items[0]?.created_at ?? null,
      sugerencias_pendientes: items.filter((i) => i.aprobado === null),
      historial_reciente: items.filter((i) => i.aprobado !== null).slice(0, 3),
    };
  }

  if (tipo === "etapa") {
    const [protRes, sugRes] = await Promise.all([
      db.from("etapa_protocolo")
        .select("tipo, regla_avance, regla_retroceso, regla_espera, updated_at")
        .eq("etapa_id", id)
        .maybeSingle(),
      db.from("sugerencias_ia")
        .select("id, titulo, contenido, prioridad, created_at, aprobado, metadata")
        .eq("tipo", "pipeline")
        .filter("metadata->>etapa_id", "eq", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const protocolo = protRes.data;
    const items = (sugRes.data ?? []) as SugerenciaPanel[];
    return {
      ...base,
      ultima_auditoria_at: protocolo?.updated_at ?? items[0]?.created_at ?? null,
      sugerencias_pendientes: items.filter((i) => i.aprobado === null),
      historial_reciente: items.filter((i) => i.aprobado !== null).slice(0, 3),
      protocolo_etapa: protocolo
        ? {
            tipo_protocolo: protocolo.tipo as "ia-propuesto" | "manual",
            regla_avance:    protocolo.regla_avance,
            regla_retroceso: protocolo.regla_retroceso,
            regla_espera:    protocolo.regla_espera,
            updated_at:      protocolo.updated_at,
          }
        : undefined,
    };
  }

  if (tipo === "lead") {
    const { data: lead } = await db
      .from("leads")
      .select("score_salud, contexto_updated_at, setter_fase_actual, setter_calificado, pipeline_stage")
      .eq("id", id)
      .single();
    return {
      ...base,
      ultima_auditoria_at: lead?.contexto_updated_at ?? null,
      datos_lead: lead
        ? {
            score_salud:         lead.score_salud ?? 50,
            contexto_updated_at: lead.contexto_updated_at,
            setter_fase_actual:  lead.setter_fase_actual,
            setter_calificado:   lead.setter_calificado,
            pipeline_stage:      lead.pipeline_stage ?? "—",
          }
        : undefined,
    };
  }

  return base;
}

export async function dispararAuditoriaAhoraAction(
  tipo: TipoAuditoria,
  id: string
): Promise<{ ok: boolean; mensaje?: string }> {
  try {
    if (tipo === "servicio") {
      const { dispararAuditoria } = await import("@/services/auditor-servicios");
      await dispararAuditoria(id, "editar");
      return { ok: true };
    }
    if (tipo === "pipeline") {
      const { dispararAuditoriaPipeline } = await import("@/services/auditor-pipelines");
      await dispararAuditoriaPipeline(id, "scan_global");
      return { ok: true };
    }
    if (tipo === "etapa") {
      const { generarSugerenciasProtocolo } = await import("@/services/protocolo-etapa");
      await generarSugerenciasProtocolo();
      return { ok: true };
    }
    if (tipo === "kb") {
      return {
        ok: false,
        mensaje: "La auditoría de KB opera sobre el catálogo completo. Usa el disparo manual en /admin/automatizaciones.",
      };
    }
    if (tipo === "lead") {
      const { actualizarScoreSalud } = await import("@/services/score-salud");
      await actualizarScoreSalud(id);
      return { ok: true };
    }
    return { ok: false, mensaje: "Tipo no reconocido" };
  } catch (err) {
    console.error("[dispararAuditoriaAhora]", err);
    return { ok: false, mensaje: String(err) };
  }
}

export async function aprobarSugerenciaModalAction(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data } = await supabase
    .from("sugerencias_ia")
    .select("titulo, descripcion")
    .eq("id", id)
    .single();
  await supabase.from("sugerencias_ia").update({ aprobado: true }).eq("id", id);
  if (data?.titulo) {
    const { autoAprobarSimilares } = await import("@/lib/ai/similitud-sugerencias");
    void autoAprobarSimilares(id, data.titulo, data.descripcion ?? "").catch(console.error);
  }
  revalidatePath("/admin/aprobaciones");
}

export async function rechazarSugerenciaModalAction(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  await supabase.from("sugerencias_ia").update({ aprobado: false }).eq("id", id);
  revalidatePath("/admin/aprobaciones");
}
