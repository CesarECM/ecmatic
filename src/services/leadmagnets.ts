// S20.1 — CRUD de leadmagnets: materiales de captación clasificados por tipo y fase CAGC.

import { createServiceClient } from "@/lib/supabase/service";
import type { TipoLeadmagnet } from "@/lib/supabase/types";

export interface Leadmagnet {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: TipoLeadmagnet;
  fases_cagc_objetivo: number[];
  contenido: string | null;
  score_efectividad: number;
  activo: boolean;
  veces_ofrecido: number;
  veces_aceptado: number;
  created_at: string;
  updated_at: string;
}

export interface CrearLeadmagnetInput {
  titulo: string;
  descripcion?: string;
  tipo: TipoLeadmagnet;
  fases_cagc_objetivo: number[];
  contenido?: string | null;
  score_efectividad?: number;
}

export async function crearLeadmagnet(input: CrearLeadmagnetInput): Promise<Leadmagnet> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("leadmagnets")
    .insert({
      titulo:               input.titulo,
      descripcion:          input.descripcion ?? "",
      tipo:                 input.tipo,
      fases_cagc_objetivo:  input.fases_cagc_objetivo,
      contenido:            input.contenido ?? null,
      score_efectividad:    input.score_efectividad ?? 0.5,
    })
    .select()
    .single();

  if (error) throw new Error(`[leadmagnets] Error creando: ${error.message}`);
  return data as Leadmagnet;
}

export async function listarLeadmagnets(filtros?: {
  tipo?: TipoLeadmagnet;
  soloActivos?: boolean;
  faseCagc?: number;
}): Promise<Leadmagnet[]> {
  const supabase = createServiceClient();
  let query = supabase.from("leadmagnets").select("*").order("score_efectividad", { ascending: false });

  if (filtros?.tipo) query = query.eq("tipo", filtros.tipo);
  if (filtros?.soloActivos !== false) query = query.eq("activo", true);
  if (filtros?.faseCagc !== undefined) {
    query = query.contains("fases_cagc_objetivo", [filtros.faseCagc]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[leadmagnets] Error listando: ${error.message}`);
  return (data ?? []) as Leadmagnet[];
}

export async function obtenerLeadmagnet(id: string): Promise<Leadmagnet | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("leadmagnets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Leadmagnet;
}

export async function actualizarLeadmagnet(
  id: string,
  campos: Partial<Omit<Leadmagnet, "id" | "created_at" | "updated_at">>
): Promise<Leadmagnet> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("leadmagnets")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`[leadmagnets] Error actualizando: ${error.message}`);
  return data as Leadmagnet;
}

export async function registrarOfrecimiento(
  id: string,
  aceptado: boolean
): Promise<void> {
  const supabase = createServiceClient();
  const lm = await obtenerLeadmagnet(id);
  if (!lm) return;

  const veces_ofrecido = lm.veces_ofrecido + 1;
  const veces_aceptado = lm.veces_aceptado + (aceptado ? 1 : 0);
  const score_efectividad = veces_ofrecido > 0
    ? Math.min(1, Number((veces_aceptado / veces_ofrecido).toFixed(2)))
    : lm.score_efectividad;

  await supabase
    .from("leadmagnets")
    .update({ veces_ofrecido, veces_aceptado, score_efectividad })
    .eq("id", id);
}

export async function eliminarLeadmagnet(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("leadmagnets").delete().eq("id", id);
  if (error) throw new Error(`[leadmagnets] Error eliminando: ${error.message}`);
}
