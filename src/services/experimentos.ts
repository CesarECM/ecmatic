import { createServiceClient } from "@/lib/supabase/service";

export interface Experimento {
  id: string; nombre: string; descripcion: string | null;
  precio_a_centavos: number; precio_b_centavos: number;
  segmento_a: string; segmento_b: string; activo: boolean;
  ganador: "a" | "b" | null;
  conversiones_a: number; conversiones_b: number;
  asignaciones_a: number; asignaciones_b: number;
}

// S11.4 — Lista experimentos de precio
export async function listarExperimentos(): Promise<Experimento[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("experimentos_precios").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`[experimentos] ${error.message}`);
  return (data ?? []) as Experimento[];
}

// S11.4 — Crea un nuevo experimento de precio
export async function crearExperimento(params: {
  nombre: string; descripcion?: string;
  precioACentavos: number; precioBCentavos: number;
  segmentoA: string; segmentoB: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("experimentos_precios").insert({
    nombre: params.nombre,
    descripcion: params.descripcion ?? null,
    precio_a_centavos: params.precioACentavos,
    precio_b_centavos: params.precioBCentavos,
    segmento_a: params.segmentoA,
    segmento_b: params.segmentoB,
  });
}

// S11.4 — Asigna un lead a un grupo del experimento activo y devuelve el precio
export async function asignarExperimento(leadId: string): Promise<{
  experimentoId: string; grupo: "a" | "b"; precioCentavos: number;
} | null> {
  const supabase = createServiceClient();

  const { data: exp } = await supabase
    .from("experimentos_precios").select("*").eq("activo", true).limit(1).maybeSingle();
  if (!exp) return null;

  // Verificar si ya fue asignado
  const { data: lead } = await supabase
    .from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata ?? {}) as Record<string, unknown>;
  if (meta.experimento_id === exp.id) {
    return {
      experimentoId: exp.id,
      grupo: meta.experimento_grupo as "a" | "b",
      precioCentavos: meta.experimento_grupo === "a" ? exp.precio_a_centavos : exp.precio_b_centavos,
    };
  }

  // Asignar al grupo con menos asignaciones
  const grupo: "a" | "b" = exp.asignaciones_a <= exp.asignaciones_b ? "a" : "b";
  const precioCentavos = grupo === "a" ? exp.precio_a_centavos : exp.precio_b_centavos;
  const campo = grupo === "a" ? { asignaciones_a: exp.asignaciones_a + 1 } : { asignaciones_b: exp.asignaciones_b + 1 };

  await Promise.all([
    supabase.from("experimentos_precios").update(campo).eq("id", exp.id),
    supabase.from("leads").update({
      metadata: { ...meta, experimento_id: exp.id, experimento_grupo: grupo },
    }).eq("id", leadId),
  ]);

  return { experimentoId: exp.id, grupo, precioCentavos };
}

// S11.4 — Registra conversión en el experimento
export async function registrarConversionExperimento(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata ?? {}) as Record<string, unknown>;
  const expId = meta.experimento_id as string | undefined;
  const grupo = meta.experimento_grupo as "a" | "b" | undefined;
  if (!expId || !grupo) return;

  const { data: exp } = await supabase
    .from("experimentos_precios").select("conversiones_a, conversiones_b").eq("id", expId).single();
  if (!exp) return;

  const campo = grupo === "a"
    ? { conversiones_a: exp.conversiones_a + 1 }
    : { conversiones_b: exp.conversiones_b + 1 };
  await supabase.from("experimentos_precios").update(campo).eq("id", expId);
}

// S11.4 — Declara el ganador y desactiva el experimento
export async function declararGanador(experimentoId: string, ganador: "a" | "b"): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("experimentos_precios")
    .update({ ganador, activo: false }).eq("id", experimentoId);
}
