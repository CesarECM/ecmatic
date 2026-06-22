// S24.4 — Motor de detección de servicios sin brochure.
// 1. Detecta servicios activos sin brochure vinculado (o suficiente uso_score).
// 2. Muestrea conversaciones recientes del sistema.
// 3. La IA decide cuáles justifican crear un brochure.
// 4. Genera sugerencias_ia para el admin.

import { createServiceClient } from "@/lib/supabase/service";
import { detectarBrochuresFaltantes, type ServicioCandidato } from "@/lib/ai/brochures-faltantes";

const LEADS_A_MUESTREAR  = 15;
const MENSAJES_POR_LEAD  = 5;
const USO_MINIMO         = 2;   // score_uso mínimo para considerar el servicio relevante

export interface ResultadoScanBrochures {
  serviciosSinBrochure: number;
  serviciosAnalizados:  number;
  sugerenciasCreadas:   number;
  sugerenciasDuplicadas: number;
}

export async function scanearBrochuresFaltantes(): Promise<ResultadoScanBrochures> {
  const supabase = createServiceClient();

  // 1. Servicios activos sin brochure vinculado con uso suficiente
  const { data: servicios } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, score_uso")
    .eq("tipo", "servicio")
    .eq("activo", true)
    .eq("aprobado", true)
    .gte("score_uso", USO_MINIMO)
    .order("score_uso", { ascending: false });

  if (!servicios?.length) {
    return { serviciosSinBrochure: 0, serviciosAnalizados: 0, sugerenciasCreadas: 0, sugerenciasDuplicadas: 0 };
  }

  // Filtrar los que ya tienen brochure
  const { data: brochuresExistentes } = await supabase
    .from("brochures")
    .select("recurso_id")
    .not("recurso_id", "is", null);

  const idsConBrochure = new Set(
    (brochuresExistentes ?? []).map((b: { recurso_id: string | null }) => b.recurso_id ?? "")
  );

  const candidatos: ServicioCandidato[] = (servicios as { id: string; titulo: string; score_uso: number }[])
    .filter((s) => !idsConBrochure.has(s.id));

  if (!candidatos.length) {
    return { serviciosSinBrochure: 0, serviciosAnalizados: 0, sugerenciasCreadas: 0, sugerenciasDuplicadas: 0 };
  }

  // 2. Muestrear conversaciones recientes del sistema
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("activo", true)
    .eq("archivado", false)
    .order("updated_at", { ascending: false })
    .limit(LEADS_A_MUESTREAR);

  const muestras: string[] = [];
  for (const lead of leads ?? []) {
    const { data: msgs } = await (supabase as any)
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", lead.id)
      .eq("direccion", "entrante")
      .order("created_at", { ascending: false })
      .limit(MENSAJES_POR_LEAD);

    if (msgs?.length) {
      muestras.push(
        (msgs as { contenido: string }[]).reverse().map((m) => m.contenido).join(" | ")
      );
    }
  }

  if (!muestras.length) {
    return { serviciosSinBrochure: candidatos.length, serviciosAnalizados: 0, sugerenciasCreadas: 0, sugerenciasDuplicadas: 0 };
  }

  // 3. Análisis IA
  const sugeridas = await detectarBrochuresFaltantes(candidatos, muestras);

  if (!sugeridas.length) {
    return { serviciosSinBrochure: candidatos.length, serviciosAnalizados: muestras.length, sugerenciasCreadas: 0, sugerenciasDuplicadas: 0 };
  }

  // 4. Filtrar duplicados pendientes
  const { data: pendientes } = await (supabase as any)
    .from("sugerencias_ia")
    .select("metadata")
    .eq("tipo", "general")
    .is("aprobado", null);

  const idsPendientes = new Set(
    (pendientes ?? []).map((s: { metadata: Record<string, unknown> }) =>
      (s.metadata?.servicio_id as string | undefined) ?? ""
    )
  );

  const nuevas     = sugeridas.filter((s) => !idsPendientes.has(s.servicio_id));
  const duplicadas = sugeridas.length - nuevas.length;

  // 5. Insertar sugerencias
  for (const s of nuevas) {
    await (supabase as any).from("sugerencias_ia").insert({
      tipo:        "general",
      titulo:      `Brochure faltante: ${s.titulo_servicio}`,
      descripcion: `El servicio no tiene brochure y el patrón de conversaciones lo justifica. ${s.justificacion}`,
      prioridad:   "puede_esperar",
      servicio_id: s.servicio_id,
      metadata:    {
        categoria:       "brochure_faltante",
        titulo_servicio: s.titulo_servicio,
      } satisfies Record<string, unknown>,
    });
  }

  return {
    serviciosSinBrochure:  candidatos.length,
    serviciosAnalizados:   muestras.length,
    sugerenciasCreadas:    nuevas.length,
    sugerenciasDuplicadas: duplicadas,
  };
}
