// MPS-21 S78 — Matching de reglas conversacionales para inyección en motor.
// Una regla aplica si TODAS sus condiciones hacen match con el contexto del lead.
// Las reglas que aplican se inyectan como bloque en el system prompt de Claude.

import { createServiceClient } from "@/lib/supabase/service";

export interface ReglaConversacional {
  id: string;
  nombre: string;
  tipo: "tactica" | "urgencia" | "restriccion" | "producto" | "rebate";
  condiciones: {
    tags_ghl?: string[];
    temperamento?: string;
    pipeline_stage?: string;
  };
  instruccion: string;
  prioridad: number;
}

export interface ContextoMatchReglas {
  tagsGhl: string[];
  temperamento: string | null;
  pipelineStage: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

function reglaAplica(regla: ReglaConversacional, ctx: ContextoMatchReglas): boolean {
  const c = regla.condiciones;

  if (c.tags_ghl?.length) {
    const tagSet = new Set(ctx.tagsGhl);
    if (!c.tags_ghl.every(t => tagSet.has(t))) return false;
  }

  if (c.temperamento && ctx.temperamento !== c.temperamento) return false;

  if (c.pipeline_stage && ctx.pipelineStage !== c.pipeline_stage) return false;

  return true;
}

export async function obtenerReglasAplicables(
  ctx: ContextoMatchReglas
): Promise<ReglaConversacional[]> {
  const { data } = await db()
    .from("reglas_conversacionales")
    .select("id, nombre, tipo, condiciones, instruccion, prioridad")
    .eq("activa", true)
    .eq("aprobada", true)
    .order("prioridad", { ascending: false })
    .limit(50);

  if (!data?.length) return [];

  return (data as ReglaConversacional[]).filter(r => reglaAplica(r, ctx));
}

export function formatearReglasParaPrompt(reglas: ReglaConversacional[]): string {
  if (!reglas.length) return "";

  const porTipo: Partial<Record<ReglaConversacional["tipo"], ReglaConversacional[]>> = {};
  for (const r of reglas) {
    (porTipo[r.tipo] ??= []).push(r);
  }

  const ETIQUETAS: Record<ReglaConversacional["tipo"], string> = {
    tactica:     "TÁCTICAS DE VENTA",
    urgencia:    "URGENCIA",
    restriccion: "RESTRICCIONES",
    producto:    "INSTRUCCIONES DE PRODUCTO",
    rebate:      "REBATES DE OBJECIÓN",
  };

  const bloques: string[] = ["\nREGLAS CONVERSACIONALES ACTIVAS (seguir en este orden de prioridad):"];

  for (const tipo of ["restriccion", "urgencia", "rebate", "producto", "tactica"] as const) {
    const grupo = porTipo[tipo];
    if (!grupo?.length) continue;
    bloques.push(`\n[${ETIQUETAS[tipo]}]`);
    grupo.forEach(r => bloques.push(`• ${r.instruccion}`));
  }

  return bloques.join("\n");
}
