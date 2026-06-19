import { createServiceClient } from "@/lib/supabase/service";
import type { DimensionesMatriz, OrigenMatriz } from "@/lib/supabase/types";

export interface CeldaMatriz {
  id: string;
  dimensiones: DimensionesMatriz;
  respuesta_sugerida: string;
  score_efectividad: number;
  usos: number;
  cierres: number;
  aprobado: boolean;
  origen: OrigenMatriz;
  created_at: string;
}

export interface FiltrosMatriz {
  temperamento?: string;
  objecion?: string;
  servicio?: string;
  tipo_cliente?: string;
  fase_cagc?: number;
  aprobado?: boolean;
}

// S5.3 — Busca la celda más específica que coincida con las dimensiones dadas.
// Si no hay coincidencia exacta, relaja progresivamente eliminando dimensiones.
export async function buscarEnMatriz(
  dimensiones: DimensionesMatriz
): Promise<CeldaMatriz | null> {
  const supabase = createServiceClient();
  const claves = Object.keys(dimensiones) as (keyof DimensionesMatriz)[];

  for (let i = 0; i < claves.length; i++) {
    const dims: Partial<DimensionesMatriz> = {};
    claves.slice(0, claves.length - i).forEach((k) => {
      (dims as Record<string, unknown>)[k] = dimensiones[k];
    });

    const { data } = await supabase
      .from("matriz_nd")
      .select("*")
      .eq("aprobado", true)
      .contains("dimensiones", dims as Record<string, unknown>)
      .order("score_efectividad", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) return data as CeldaMatriz;
  }
  return null;
}

// S5.2 / S5.5 — Lista celdas con filtros opcionales
export async function listarMatriz(filtros?: FiltrosMatriz): Promise<CeldaMatriz[]> {
  const supabase = createServiceClient();
  let query = supabase.from("matriz_nd").select("*").order("score_efectividad", { ascending: false });

  if (filtros?.aprobado !== undefined) query = query.eq("aprobado", filtros.aprobado);

  const dimFiltro: Partial<DimensionesMatriz> = {};
  if (filtros?.temperamento) dimFiltro.temperamento = filtros.temperamento as DimensionesMatriz["temperamento"];
  if (filtros?.objecion) dimFiltro.objecion = filtros.objecion;
  if (filtros?.servicio) dimFiltro.servicio = filtros.servicio;
  if (filtros?.tipo_cliente) dimFiltro.tipo_cliente = filtros.tipo_cliente as DimensionesMatriz["tipo_cliente"];
  if (filtros?.fase_cagc !== undefined) dimFiltro.fase_cagc = filtros.fase_cagc;

  if (Object.keys(dimFiltro).length > 0) {
    query = query.contains("dimensiones", dimFiltro as Record<string, unknown>);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[matriz] Error listando: ${error.message}`);
  return (data ?? []) as CeldaMatriz[];
}

// S5.5 — Crea una celda nueva (normalmente generada por IA, pendiente aprobación)
export async function crearCelda(
  dimensiones: DimensionesMatriz,
  respuestaSugerida: string,
  origen: OrigenMatriz = "ia_sugerido"
): Promise<CeldaMatriz> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("matriz_nd")
    .insert({ dimensiones, respuesta_sugerida: respuestaSugerida, origen, aprobado: false })
    .select()
    .single();

  if (error) throw new Error(`[matriz] Error creando celda: ${error.message}`);
  return data as CeldaMatriz;
}

// S5.5 — Aprueba una celda para que el motor la use
export async function aprobarCelda(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("matriz_nd")
    .update({ aprobado: true })
    .eq("id", id);
  if (error) throw new Error(`[matriz] Error aprobando celda: ${error.message}`);
}

// S5.4 — Actualiza score de efectividad al cerrar o perder un lead.
// Busca celdas que coincidan con las dimensiones y ajusta su score.
export async function actualizarScoreMatriz(
  dimensiones: DimensionesMatriz,
  cerrado: boolean
): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("matriz_nd")
    .select("id, usos, cierres")
    .eq("aprobado", true)
    .contains("dimensiones", dimensiones as Record<string, unknown>);

  if (!data || data.length === 0) return;

  for (const celda of data) {
    const nuevosUsos = celda.usos + 1;
    const nuevosCierres = celda.cierres + (cerrado ? 1 : 0);
    const nuevoScore = Math.min(1, Math.max(0, nuevosCierres / nuevosUsos));

    await supabase
      .from("matriz_nd")
      .update({ usos: nuevosUsos, cierres: nuevosCierres, score_efectividad: nuevoScore })
      .eq("id", celda.id);
  }
}
