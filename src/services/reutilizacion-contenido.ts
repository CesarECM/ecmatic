import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";

export interface RecursoReutilizable {
  id: string;
  tipo: "leadmagnet" | "brochure";
  titulo: string;
  similitud: number;
}

// S28.6 — Busca leadmagnets y brochures existentes similares a una necesidad
// antes de proponer crear contenido nuevo. Usa búsqueda textual sobre título.
export async function buscarContenidoReutilizable(
  descripcionNecesidad: string,
  limite = 5
): Promise<RecursoReutilizable[]> {
  const supabase = createServiceClient();
  void generarEmbedding; // reservado para cuando se añadan embeddings a estas tablas

  const palabrasClave = descripcionNecesidad.split(" ").slice(0, 3).join(" | ");

  const [lmData, brData] = await Promise.all([
    supabase
      .from("leadmagnets")
      .select("id, titulo")
      .eq("activo", true)
      .ilike("titulo", `%${descripcionNecesidad.split(" ")[0]}%`)
      .limit(limite)
      .then((r) => r.data ?? []),
    supabase
      .from("brochures")
      .select("id, titulo")
      .eq("activo", true)
      .ilike("titulo", `%${descripcionNecesidad.split(" ")[0]}%`)
      .limit(limite)
      .then((r) => r.data ?? []),
  ]);

  void palabrasClave;

  const resultados: RecursoReutilizable[] = [
    ...(lmData as { id: string; titulo: string }[]).map((r) => ({
      id: r.id,
      tipo: "leadmagnet" as const,
      titulo: r.titulo,
      similitud: 0.7,
    })),
    ...(brData as { id: string; titulo: string }[]).map((r) => ({
      id: r.id,
      tipo: "brochure" as const,
      titulo: r.titulo,
      similitud: 0.7,
    })),
  ];

  return resultados.slice(0, limite);
}

// S28.6 — Genera una sugerencia en cola de aprobación cuando una etapa no tiene
// contenido asignado, priorizando reutilización sobre creación desde cero.
export async function sugerirContenidoParaEtapa(
  etapaId: string,
  etapaNombre: string,
  ruta: string
): Promise<void> {
  const supabase = createServiceClient();

  // Comprobar si ya hay contenido asignado
  const { data: existente } = await supabase
    .from("etapa_contenido")
    .select("id")
    .eq("etapa_id", etapaId)
    .eq("activo", true)
    .limit(1);

  if (existente?.length) return; // ya tiene contenido

  // Comprobar sugerencia reciente
  const { data: sugerenciaReciente } = await supabase
    .from("sugerencias_ia")
    .select("id")
    .eq("tipo", "pipeline")
    .ilike("titulo", `%contenido: ${etapaNombre}%`)
    .eq("aprobado", false)
    .maybeSingle();

  if (sugerenciaReciente) return;

  // Buscar contenido reutilizable
  const candidatos = await buscarContenidoReutilizable(
    `contenido para leads en etapa ${etapaNombre} pipeline ${ruta}`,
    3
  );

  const descripcion = candidatos.length
    ? `La etapa "${etapaNombre}" (${ruta}) no tiene contenido asignado. Se encontraron ${candidatos.length} recurso(s) reutilizables: ${candidatos.map((c) => c.titulo).join(", ")}. Asígnalos o crea contenido nuevo.`
    : `La etapa "${etapaNombre}" (${ruta}) no tiene contenido asignado y no se encontraron recursos reutilizables. Considera crear un leadmagnet o brochure específico.`;

  await supabase.from("sugerencias_ia").insert({
    tipo: "pipeline",
    titulo: `Sin contenido: ${etapaNombre} (${ruta})`,
    descripcion,
    prioridad: "puede_esperar",
    metadata: { etapa_id: etapaId, candidatos, accion: "asignar_contenido_etapa" },
  });
}
