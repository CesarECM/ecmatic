// S19.4 — Pipelines como ramas no-lineales con consciencia CAGC
// Usa es_tronco + etapas_siguientes de pipeline_etapas para
// sugerir el próximo paso correcto según la fase CAGC del lead.

import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineRuta } from "@/lib/supabase/types";

type EtapaConFases = { nombre: string; fases_cagc: number[]; orden: number; es_tronco: boolean };

// ── Helpers ───────────────────────────────────────────────────

function distanciaFase(fases: number[], objetivo: number): number {
  if (!fases.length) return 999;
  return Math.min(...fases.map((f) => Math.abs(f - objetivo)));
}

// ── API pública ───────────────────────────────────────────────

// Etapas siguientes permitidas, ordenadas por relevancia CAGC.
// Si faseCAGC está informada, las etapas cuyo rango la incluye van primero.
export async function obtenerSiguientesEtapas(
  etapaNombre: string,
  ruta: PipelineRuta,
  faseCAGC?: number
): Promise<string[]> {
  const supabase = createServiceClient();

  const { data: etapa } = await supabase
    .from("pipeline_etapas")
    .select("etapas_siguientes")
    .eq("nombre", etapaNombre)
    .eq("ruta", ruta)
    .eq("activo", true)
    .maybeSingle();

  const siguientes = (etapa?.etapas_siguientes as string[] | null) ?? [];
  if (!faseCAGC || siguientes.length <= 1) return siguientes;

  // Obtener fases_cagc de las etapas candidatas para priorizar
  const { data: candidatas } = await supabase
    .from("pipeline_etapas")
    .select("nombre, fases_cagc, orden")
    .in("nombre", siguientes)
    .eq("ruta", ruta);

  const infoMap = new Map<string, { fases: number[]; orden: number }>(
    (candidatas ?? []).map((e: any) => [
      e.nombre,
      { fases: e.fases_cagc as number[], orden: e.orden as number },
    ])
  );

  return [...siguientes].sort((a, b) => {
    const ia = infoMap.get(a) ?? { fases: [], orden: 99 };
    const ib = infoMap.get(b) ?? { fases: [], orden: 99 };
    const aIncludes = ia.fases.includes(faseCAGC) ? 0 : 1;
    const bIncludes = ib.fases.includes(faseCAGC) ? 0 : 1;
    if (aIncludes !== bIncludes) return aIncludes - bIncludes;
    return distanciaFase(ia.fases, faseCAGC) - distanciaFase(ib.fases, faseCAGC);
  });
}

// Etapa del pipeline más alineada con una fase CAGC concreta.
// Útil para reubicar un lead que entra tarde al funnel con fase CAGC ya conocida.
export async function etapaRecomendadaPorFase(
  ruta: PipelineRuta,
  faseCAGC: number
): Promise<string | null> {
  const supabase = createServiceClient();

  const { data: etapas } = await supabase
    .from("pipeline_etapas")
    .select("nombre, fases_cagc, orden")
    .eq("ruta", ruta)
    .eq("activo", true)
    .order("orden");

  if (!etapas?.length) return null;

  const lista = etapas as EtapaConFases[];

  // Preferir match exacto (fase incluida en el array)
  const exacta = lista.find((e) => (e.fases_cagc as number[]).includes(faseCAGC));
  if (exacta) return exacta.nombre;

  // Fallback: etapa con menor distancia al rango de fases
  const conFases = lista.filter((e) => e.fases_cagc.length > 0);
  if (!conFases.length) return lista[0]?.nombre ?? null;

  return conFases.reduce((best, curr) =>
    distanciaFase(curr.fases_cagc, faseCAGC) < distanciaFase(best.fases_cagc, faseCAGC)
      ? curr
      : best
  ).nombre;
}

// Etapas del tronco común de un pipeline (recorrido base obligatorio).
export async function obtenerTroncoComun(ruta: PipelineRuta): Promise<string[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("pipeline_etapas")
    .select("nombre")
    .eq("ruta", ruta)
    .eq("es_tronco", true)
    .eq("activo", true)
    .order("orden");

  return (data ?? []).map((e: any) => e.nombre as string);
}
