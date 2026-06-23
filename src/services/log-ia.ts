import { createServiceClient } from "@/lib/supabase/service";

// TareaIA actuales (model-router.ts) + valores legacy de Sprint 10
export type TipoAccionIA =
  // Tareas actuales — espejo de TareaIA en model-router.ts
  | "CLASIFICAR"
  | "RESPUESTA"
  | "ANALISIS"
  | "COACHING"
  | "ENCUESTA"
  | "SUGERIR_KB"
  | "COMPETIDORES"
  | "CHURN"
  | "CAGC_INFERIR"
  | "VISION"
  | "SENALES"
  | "LEADMAGNET"
  | "CONTEXTO"
  | "PAQUETE_SERVICIO"
  | "SETTER"
  | "CUALIFICACION"
  | "OBJECION"
  | "DESCONFIANZA"
  | "BRIEF_DISENO"
  | "CLUSTERING"
  // Valores legacy Sprint 10
  | "clasificar_intencion"
  | "generar_respuesta"
  | "generar_encuesta"
  | "inferir_temperamento"
  | "sugerir_kb"
  | "detectar_competidor"
  | "detectar_promesa"
  | "detectar_momento_cierre"
  | "generar_slot_cita"
  | "calcular_churn"
  | "upsell";

// S10.8 — Registra una acción de IA en el log consultable
export async function registrarAccionIA(params: {
  tipoAccion: TipoAccionIA;
  leadId?: string;
  recursoKbId?: string;
  resultado?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("log_ia").insert({
    tipo_accion: params.tipoAccion,
    lead_id: params.leadId ?? null,
    recurso_kb_id: params.recursoKbId ?? null,
    resultado: params.resultado ?? null,
    metadata: params.metadata ?? {},
  }).then(({ error }) => {
    if (error) console.error("[log-ia] Error registrando:", error.message);
  });
}

// S10.8 — Lista el log con filtros opcionales
export async function listarLogIA(filtros?: {
  tipoAccion?: string;
  desde?: string;
  leadId?: string;
  limit?: number;
}) {
  const supabase = createServiceClient();
  let q = supabase
    .from("log_ia")
    .select("id, tipo_accion, resultado, metadata, created_at, leads(nombre, telefono)")
    .order("created_at", { ascending: false })
    .limit(filtros?.limit ?? 100);

  if (filtros?.tipoAccion) q = q.eq("tipo_accion", filtros.tipoAccion);
  if (filtros?.desde) q = q.gte("created_at", filtros.desde);
  if (filtros?.leadId) q = q.eq("lead_id", filtros.leadId);

  const { data, error } = await q;
  if (error) throw new Error(`[log-ia] ${error.message}`);
  return data ?? [];
}

// S10.3 — Crea una sugerencia IA en la cola de aprobaciones
export async function crearSugerenciaIA(params: {
  tipo: "pipeline" | "flujo" | "avatar" | "gatillo" | "general";
  titulo: string;
  descripcion: string;
  prioridad?: "urgente" | "importante" | "puede_esperar";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").insert({
    tipo: params.tipo,
    titulo: params.titulo,
    descripcion: params.descripcion,
    prioridad: params.prioridad ?? "puede_esperar",
    metadata: params.metadata ?? {},
  }).then(({ error }) => {
    if (error) console.error("[log-ia] Error creando sugerencia:", error.message);
  });
}
