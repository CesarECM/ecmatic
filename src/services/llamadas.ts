import { createServiceClient } from "@/lib/supabase/service";

export type ObjetivoLlamada = "cierre" | "avance";
export type ResultadoLlamada = "exitoso" | "no-contesta" | "seguimiento" | "perdido";

export interface Llamada {
  id: string;
  lead_id: string;
  vendedor_id: string;
  objetivo: ObjetivoLlamada;
  resultado: ResultadoLlamada | null;
  notas: string | null;
  duracion_min: number | null;
  created_at: string;
  leads?: { nombre: string | null; telefono: string | null };
}

export interface MetricasLlamadasVendedor {
  total: number;
  exitosas: number;
  noContesta: number;
  tasaExito: number;
  duracionPromedioMin: number;
}

// S28.4 — Registra una llamada manual del vendedor
export async function registrarLlamada(params: {
  leadId: string;
  vendedorId: string;
  objetivo: ObjetivoLlamada;
  resultado: ResultadoLlamada;
  notas?: string;
  duracionMin?: number;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("llamadas_vendedor")
    .insert({
      lead_id: params.leadId,
      vendedor_id: params.vendedorId,
      objetivo: params.objetivo,
      resultado: params.resultado,
      notas: params.notas ?? null,
      duracion_min: params.duracionMin ?? null,
    })
    .throwOnError();
}

// S28.4 — Lista llamadas de un vendedor con datos del lead
export async function listarLlamadasVendedor(
  vendedorId: string,
  limite = 50
): Promise<Llamada[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .select("*, leads(nombre, telefono)")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`[llamadas] ${error.message}`);
  return (data ?? []) as Llamada[];
}

// S28.4 — Lista llamadas de todos los vendedores (vista admin)
export async function listarTodasLlamadas(limite = 100): Promise<Llamada[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .select("*, leads(nombre, telefono)")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`[llamadas] ${error.message}`);
  return (data ?? []) as Llamada[];
}

// S28.4 — Métricas de eficiencia del vendedor en llamadas
export async function metricasLlamadasVendedor(
  vendedorId: string
): Promise<MetricasLlamadasVendedor> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("llamadas_vendedor")
    .select("resultado, duracion_min")
    .eq("vendedor_id", vendedorId);

  const llamadas = data ?? [];
  const total = llamadas.length;
  const exitosas = llamadas.filter((l: { resultado: string | null }) => l.resultado === "exitoso").length;
  const noContesta = llamadas.filter((l: { resultado: string | null }) => l.resultado === "no-contesta").length;
  const conDuracion = llamadas.filter((l: { duracion_min: number | null }) => l.duracion_min != null);
  const duracionTotal = conDuracion.reduce(
    (acc: number, l: { duracion_min: number | null }) => acc + (l.duracion_min ?? 0), 0
  );

  return {
    total,
    exitosas,
    noContesta,
    tasaExito: total > 0 ? Math.round((exitosas / total) * 100) : 0,
    duracionPromedioMin: conDuracion.length > 0 ? Math.round(duracionTotal / conDuracion.length) : 0,
  };
}
