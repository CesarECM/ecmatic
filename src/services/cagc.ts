import { createServiceClient } from "@/lib/supabase/service";

export interface FaseCAGC {
  numero: number;
  nombre: string;
  nombre_tecnico: string;
  descripcion: string;
  senales_deteccion: string[];
  acciones_empresa: string[];
}

export interface EstadoCAGC {
  lead_id: string;
  fase_numero: number;
  confianza: number;
  historial: TransicionCAGC[];
  updated_at: string;
}

export interface TransicionCAGC {
  fase_anterior: number;
  fase_nueva: number;
  confianza: number;
  motivo?: string;
  timestamp: string;
}

// Devuelve las 17 fases ordenadas
export async function obtenerFases(): Promise<FaseCAGC[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cagc_fases")
    .select("numero, nombre, descripcion, senales_deteccion")
    .order("numero");
  if (error) throw new Error(`[cagc] Error obteniendo fases: ${error.message}`);
  return (data ?? []) as FaseCAGC[];
}

// Devuelve la fase CAGC actual de un lead (null si nunca inferida)
export async function obtenerFaseLead(leadId: string): Promise<EstadoCAGC | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lead_cagc_estado")
    .select("lead_id, fase_numero, confianza, historial, updated_at")
    .eq("lead_id", leadId)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(`[cagc] Error obteniendo fase: ${error.message}`);
  }
  return data as EstadoCAGC | null;
}

// Registra o actualiza la fase CAGC de un lead
export async function registrarFaseLead(
  leadId: string,
  nuevaFase: number,
  confianza: number,
  motivo?: string
): Promise<void> {
  const supabase = createServiceClient();

  const estado = await obtenerFaseLead(leadId);
  const ahora = new Date().toISOString();

  const transicion: TransicionCAGC = {
    fase_anterior: estado?.fase_numero ?? -1,
    fase_nueva: nuevaFase,
    confianza,
    motivo,
    timestamp: ahora,
  };

  const historialActualizado = [...(estado?.historial ?? []), transicion];

  const { error } = await supabase
    .from("lead_cagc_estado")
    .upsert(
      {
        lead_id: leadId,
        fase_numero: nuevaFase,
        confianza,
        historial: historialActualizado,
      },
      { onConflict: "lead_id" }
    );

  if (error) throw new Error(`[cagc] Error registrando fase: ${error.message}`);
}

// Devuelve leads agrupados por fase (para analítica)
export async function contarLeadsPorFase(): Promise<Record<number, number>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("lead_cagc_estado")
    .select("fase_numero");
  if (error) throw new Error(`[cagc] Error contando fases: ${error.message}`);

  const conteo: Record<number, number> = {};
  for (const row of data ?? []) {
    conteo[row.fase_numero] = (conteo[row.fase_numero] ?? 0) + 1;
  }
  return conteo;
}
