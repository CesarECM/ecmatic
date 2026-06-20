// S19.1 — huecos CAGC (cobertura cero: sin KB ni pipeline)
// S19.2 — cobertura débil (volumen real < umbral esperado por fase)

import { createServiceClient } from "@/lib/supabase/service";

// ── Interfaces ────────────────────────────────────────────────

export interface AnalisisFaseCAGC {
  faseNumero: number;
  faseNombre: string;
  faseNombreTecnico: string;
  // Leads
  leadsEnFase: number;
  leadsConPipeline: number;
  umbralLeads: number;        // mínimo esperado según modelo de embudo
  scoreVolumen: number;       // 0–1 (real / umbral, cap 1)
  // Contenido KB
  recursosKBcoincidentes: number;
  umbralRecursos: number;     // mínimo KB esperado por fase
  scoreContenido: number;     // 0–1
  // S19.1 — huecos (cobertura = 0)
  esHuecoContenido: boolean;
  esHuecoPipeline: boolean;
  // S19.2 — cobertura débil (cobertura > 0 pero insuficiente)
  coberturaBajaVolumen: boolean;
  coberturaBajaContenido: boolean;
  // Combinado
  scoreTotal: number;         // promedio scoreVolumen + scoreContenido
  severidad: "critico" | "importante" | "leve" | "ok";
}

// ── Modelos de umbral (por fase 0–16) ─────────────────────────

// Fracción esperada del total de leads según embudo saludable.
// Pesos más altos en activación/exploración; decrece hacia advocacy.
const EXPECTED_LEAD_PCT: Record<number, number> = {
  0: 0.04, 1: 0.14, 2: 0.11, 3: 0.10,
  4: 0.09, 5: 0.08, 6: 0.08, 7: 0.07,
  8: 0.06, 9: 0.06, 10: 0.05,
  11: 0.03, 12: 0.02, 13: 0.02, 14: 0.01, 15: 0.01, 16: 0.01,
};

// Mínimo de recursos KB esperados. Fases de consideración/decisión necesitan más.
const MIN_RECURSOS_KB: Record<number, number> = {
  0: 1, 1: 2, 2: 2, 3: 2,
  4: 3, 5: 3, 6: 3, 7: 3,
  8: 2, 9: 2, 10: 2,
  11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1,
};

// ── Helpers ───────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "para", "como", "cuando", "hacia", "desde", "crear", "usar", "tener",
  "hacer", "estar", "sobre", "entre", "antes", "después", "también",
  "pueden", "tiene", "tienen", "todo", "todos", "cada", "estas", "estos",
  "nivel", "etapa", "fase", "lead", "leads",
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

function score(real: number, umbral: number): number {
  if (umbral === 0) return 1;
  return Math.min(1, real / umbral);
}

function calcularSeveridad(fase: Omit<AnalisisFaseCAGC, "severidad">): AnalisisFaseCAGC["severidad"] {
  const { leadsEnFase, esHuecoContenido, esHuecoPipeline, coberturaBajaVolumen, coberturaBajaContenido } = fase;

  if (leadsEnFase > 5 && esHuecoContenido) return "critico";
  if (leadsEnFase > 0 && (esHuecoPipeline || esHuecoContenido)) return "importante";
  if (coberturaBajaContenido || coberturaBajaVolumen) return "leve";
  if (esHuecoContenido) return "leve";
  return "ok";
}

// ── Motor principal ───────────────────────────────────────────

export async function analizarFasesCAGC(): Promise<AnalisisFaseCAGC[]> {
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

  // Leads por fase
  const leadsByFase = new Map<number, Set<string>>();
  for (const le of leadEstados ?? []) {
    if (!leadsByFase.has(le.fase_numero)) leadsByFase.set(le.fase_numero, new Set());
    leadsByFase.get(le.fase_numero)!.add(le.lead_id);
  }

  const conPipelineSet = new Set((leadPipelines ?? []).map((lp) => lp.lead_id));
  const recursosActivos = (recursos ?? []) as { titulo: string; contenido: string }[];
  const totalLeads = [...leadsByFase.values()].reduce((s, set) => s + set.size, 0);

  return fases.map((fase: any) => {
    const leadsSet   = leadsByFase.get(fase.numero) ?? new Set<string>();
    const leadsEnFase      = leadsSet.size;
    const leadsConPipeline = [...leadsSet].filter((id) => conPipelineSet.has(id)).length;

    // S19.2 — umbrales cuantitativos
    const umbralLeads    = Math.ceil((EXPECTED_LEAD_PCT[fase.numero] ?? 0.02) * totalLeads * 0.5);
    const umbralRecursos = MIN_RECURSOS_KB[fase.numero] ?? 1;

    const keywords     = extraerKeywords([...(fase.senales_deteccion as string[]), ...(fase.acciones_empresa as string[])]);
    const recursosKBcoincidentes = contarCoincidencias(keywords, recursosActivos);

    const scoreVolumen   = score(leadsEnFase, umbralLeads);
    const scoreContenido = score(recursosKBcoincidentes, umbralRecursos);
    const scoreTotal     = (scoreVolumen + scoreContenido) / 2;

    // S19.1 — huecos binarios
    const esHuecoContenido = recursosKBcoincidentes === 0;
    const esHuecoPipeline  = leadsEnFase > 0 && leadsConPipeline === 0;

    // S19.2 — cobertura débil (tiene algo pero por debajo del umbral)
    const coberturaBajaVolumen   = !esHuecoPipeline && leadsEnFase > 0 && leadsEnFase < umbralLeads;
    const coberturaBajaContenido = !esHuecoContenido && recursosKBcoincidentes < umbralRecursos;

    const parcial = {
      faseNumero: fase.numero, faseNombre: fase.nombre, faseNombreTecnico: fase.nombre_tecnico,
      leadsEnFase, leadsConPipeline, umbralLeads,
      scoreVolumen, recursosKBcoincidentes, umbralRecursos, scoreContenido, scoreTotal,
      esHuecoContenido, esHuecoPipeline, coberturaBajaVolumen, coberturaBajaContenido,
    };

    return { ...parcial, severidad: calcularSeveridad(parcial) } satisfies AnalisisFaseCAGC;
  });
}

// ── Conveniencia (retrocompatibilidad S19.1 + filtros S19.2) ──

export const detectarHuecosCAGC    = () => analizarFasesCAGC().then((r) => r.filter((f) => f.esHuecoContenido || f.esHuecoPipeline));
export const detectarCoberturaDebil = () => analizarFasesCAGC().then((r) => r.filter((f) => f.coberturaBajaContenido || f.coberturaBajaVolumen));

export function resumenAnalisis(fases: AnalisisFaseCAGC[]) {
  return {
    totalFases:        fases.length,
    huecosCriticos:    fases.filter((f) => f.severidad === "critico").length,
    huecosImportantes: fases.filter((f) => f.severidad === "importante").length,
    coberturaBaja:     fases.filter((f) => f.severidad === "leve").length,
    fasesOk:           fases.filter((f) => f.severidad === "ok").length,
    scorePromedioTotal: fases.reduce((s, f) => s + f.scoreTotal, 0) / (fases.length || 1),
  };
}
