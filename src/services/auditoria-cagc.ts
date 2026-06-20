// S19.1 — Motor de detección de huecos CAGC
// Un "hueco de contenido" es una fase sin recursos KB que la cubran.
// Un "hueco de pipeline" es una fase con leads activos pero sin pipeline asignado.

import { createServiceClient } from "@/lib/supabase/service";

export interface HuecoCAGC {
  faseNumero: number;
  faseNombre: string;
  faseNombreTecnico: string;
  leadsEnFase: number;
  leadsConPipeline: number;
  recursosKBcoincidentes: number;
  esHuecoContenido: boolean;
  esHuecoPipeline: boolean;
  severidad: "critico" | "importante" | "leve" | "ok";
}

const STOP_WORDS = new Set([
  "para", "como", "cuando", "hacia", "desde", "crear", "usar", "tener",
  "hacer", "estar", "sobre", "entre", "antes", "después", "también",
  "pueden", "tiene", "tienen", "todo", "todos", "cada", "estas", "estos",
  "content", "nivel", "etapa", "fase", "lead", "leads", "crear",
]);

function extraerKeywords(textos: string[]): string[] {
  const set = new Set<string>();
  for (const t of textos) {
    t.toLowerCase()
      .replace(/[^\wáéíóúüñ\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP_WORDS.has(w))
      .forEach((w) => set.add(w));
  }
  return [...set].slice(0, 15);
}

function contarCoincidencias(
  keywords: string[],
  recursos: { titulo: string; contenido: string }[]
): number {
  return recursos.filter((r) => {
    const texto = `${r.titulo} ${r.contenido}`.toLowerCase();
    return keywords.some((kw) => texto.includes(kw));
  }).length;
}

function calcularSeveridad(
  leadsEnFase: number,
  esHuecoContenido: boolean,
  esHuecoPipeline: boolean
): HuecoCAGC["severidad"] {
  if (!esHuecoContenido && !esHuecoPipeline) return "ok";
  if (leadsEnFase > 5 && esHuecoContenido) return "critico";
  if (leadsEnFase > 0 && (esHuecoContenido || esHuecoPipeline)) return "importante";
  if (esHuecoContenido) return "leve";
  return "ok";
}

export async function detectarHuecosCAGC(): Promise<HuecoCAGC[]> {
  const supabase = createServiceClient();

  const [
    { data: fases },
    { data: leadEstados },
    { data: recursos },
    { data: leadPipelines },
  ] = await Promise.all([
    supabase
      .from("cagc_fases")
      .select("numero, nombre, nombre_tecnico, senales_deteccion, acciones_empresa")
      .order("numero"),
    supabase.from("lead_cagc_estado").select("lead_id, fase_numero"),
    supabase
      .from("recursos_conocimiento")
      .select("titulo, contenido")
      .eq("aprobado", true)
      .eq("activo", true),
    supabase.from("lead_pipelines").select("lead_id").eq("activo", true),
  ]);

  if (!fases?.length) return [];

  // Leads por fase (faseNumero → Set<lead_id>)
  const leadsByFase = new Map<number, Set<string>>();
  for (const le of leadEstados ?? []) {
    if (!leadsByFase.has(le.fase_numero)) leadsByFase.set(le.fase_numero, new Set());
    leadsByFase.get(le.fase_numero)!.add(le.lead_id);
  }

  // Set de lead_ids con pipeline activo
  const conPipelineSet = new Set((leadPipelines ?? []).map((lp) => lp.lead_id));

  const recursosActivos = (recursos ?? []) as { titulo: string; contenido: string }[];

  return fases.map((fase: any) => {
    const leadsSet = leadsByFase.get(fase.numero) ?? new Set<string>();
    const leadsEnFase = leadsSet.size;
    const leadsConPipeline = [...leadsSet].filter((id) => conPipelineSet.has(id)).length;

    const keywords = extraerKeywords([
      ...(fase.senales_deteccion as string[]),
      ...(fase.acciones_empresa as string[]),
    ]);
    const coincidencias = contarCoincidencias(keywords, recursosActivos);

    const esHuecoContenido = coincidencias === 0;
    const esHuecoPipeline = leadsEnFase > 0 && leadsConPipeline === 0;

    return {
      faseNumero: fase.numero,
      faseNombre: fase.nombre,
      faseNombreTecnico: fase.nombre_tecnico,
      leadsEnFase,
      leadsConPipeline,
      recursosKBcoincidentes: coincidencias,
      esHuecoContenido,
      esHuecoPipeline,
      severidad: calcularSeveridad(leadsEnFase, esHuecoContenido, esHuecoPipeline),
    } satisfies HuecoCAGC;
  });
}

// Resumen ejecutivo del análisis de huecos
export function resumenHuecos(huecos: HuecoCAGC[]): {
  totalHuecos: number;
  huecosCriticos: number;
  huecosImportantes: number;
  fasesOk: number;
} {
  return {
    totalHuecos:       huecos.filter((h) => h.severidad !== "ok").length,
    huecosCriticos:    huecos.filter((h) => h.severidad === "critico").length,
    huecosImportantes: huecos.filter((h) => h.severidad === "importante").length,
    fasesOk:           huecos.filter((h) => h.severidad === "ok").length,
  };
}
