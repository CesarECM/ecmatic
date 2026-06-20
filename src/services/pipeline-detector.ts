import { createServiceClient } from "@/lib/supabase/service";

// Umbral de score_uso a partir del cual un servicio se considera "con alto volumen"
const UMBRAL_USO = Number(process.env.PIPELINE_VOLUMEN_UMBRAL ?? "3");
// Ventana para deduplicar sugerencias previas (no re-alertar si ya hay una reciente)
const DIAS_DEDUP = 30;

export interface ResultadoDeteccion {
  serviciosAnalizados: number;
  alertasCreadas: number;
}

// S13.7 — Detecta servicios con alto volumen de conversación que carecen de pipeline dedicado.
// Compara score_uso de recursos tipo "servicio" contra las rutas activas de pipeline_etapas.
// Si un servicio supera el umbral y no tiene ruta correspondiente, genera sugerencia en sugerencias_ia.
export async function detectarPipelinesFaltantes(): Promise<ResultadoDeteccion> {
  const supabase = createServiceClient();

  // 1. Servicios con suficiente uso
  const { data: servicios, error: errServ } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, score_uso")
    .eq("tipo", "servicio")
    .eq("activo", true)
    .gte("score_uso", UMBRAL_USO)
    .order("score_uso", { ascending: false });

  if (errServ) throw new Error(`[pipeline-detector] Error leyendo servicios: ${errServ.message}`);
  if (!servicios?.length) return { serviciosAnalizados: 0, alertasCreadas: 0 };

  // 2. Rutas de pipeline existentes (conjunto normalizado)
  const { data: etapas } = await supabase
    .from("pipeline_etapas")
    .select("ruta")
    .eq("activo", true);

  const rutasExistentes = new Set(
    (etapas ?? []).map((e: { ruta: string }) => e.ruta.toLowerCase())
  );

  // 3. Sugerencias de pipeline pendientes recientes (para no duplicar)
  const desde = new Date(Date.now() - DIAS_DEDUP * 86_400_000).toISOString();
  const { data: previas } = await supabase
    .from("sugerencias_ia")
    .select("titulo")
    .eq("tipo", "pipeline")
    .is("aprobado", null)
    .gte("created_at", desde);

  const titulosPrevios = new Set(
    (previas ?? []).map((s: { titulo: string }) => s.titulo.toLowerCase())
  );

  let alertasCreadas = 0;

  for (const servicio of servicios) {
    const nombreNorm = servicio.titulo.toLowerCase();

    // Verificar si ya existe un pipeline cuya ruta menciona este servicio (o viceversa)
    const tienePipeline = [...rutasExistentes].some(
      (ruta) => ruta.includes(nombreNorm) || nombreNorm.includes(ruta)
    );
    if (tienePipeline) continue;

    // No duplicar sugerencias activas para el mismo servicio
    const tituloSugerencia = `Pipeline faltante: ${servicio.titulo}`;
    if (titulosPrevios.has(tituloSugerencia.toLowerCase())) continue;

    // Score_uso muy alto → importante; moderado → puede_esperar
    const prioridad = servicio.score_uso >= UMBRAL_USO * 3 ? "importante" : "puede_esperar";

    await supabase.from("sugerencias_ia").insert({
      tipo: "pipeline",
      titulo: tituloSugerencia,
      descripcion: `El servicio "${servicio.titulo}" acumula score_uso ${servicio.score_uso} (umbral: ${UMBRAL_USO}) sin pipeline dedicado. Evalúa crear un pipeline específico con las fases CAGC relevantes para este servicio.`,
      prioridad,
      aprobado: null,
    });

    alertasCreadas++;
  }

  return { serviciosAnalizados: servicios.length, alertasCreadas };
}
