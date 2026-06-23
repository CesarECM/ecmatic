import { createServiceClient } from "@/lib/supabase/service";

export type TipoAccionIA =
  | "CLASIFICAR" | "RESPUESTA" | "ANALISIS" | "COACHING" | "ENCUESTA"
  | "SUGERIR_KB" | "COMPETIDORES" | "CHURN" | "CAGC_INFERIR" | "VISION"
  | "SENALES" | "LEADMAGNET" | "CONTEXTO" | "PAQUETE_SERVICIO" | "SETTER"
  | "CUALIFICACION" | "OBJECION" | "DESCONFIANZA" | "BRIEF_DISENO" | "CLUSTERING"
  | "clasificar_intencion" | "generar_respuesta" | "generar_encuesta"
  | "inferir_temperamento" | "sugerir_kb" | "detectar_competidor"
  | "detectar_promesa" | "detectar_momento_cierre" | "generar_slot_cita"
  | "calcular_churn" | "upsell";

export type FaseIA = "llamado" | "peticion" | "respuesta" | "timeout" | "error";

export interface LogIARow {
  id: string;
  tipo_accion: string;
  resultado: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  fase: FaseIA | null;
  request_id: string | null;
  leads: { nombre: string | null; telefono: string | null } | null;
}

export interface GrupoLogIA {
  request_id: string;
  tipo_accion: string;
  timestamp: string;
  logs: LogIARow[];
}

// S10.8 — Registra una acción de IA en el log (para callers que no usan callClaudeIA)
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
    lead_id:     params.leadId ?? null,
    recurso_kb_id: params.recursoKbId ?? null,
    resultado:   params.resultado ?? null,
    metadata:    params.metadata ?? {},
  }).then(({ error }) => {
    if (error) console.error("[log-ia] Error registrando:", error.message);
  });
}

export async function listarLogIA(filtros?: {
  tipoAccion?: string;
  fase?: string;
  desde?: string;
  hasta?: string;
  leadId?: string;
  limit?: number;
}): Promise<LogIARow[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("log_ia")
    .select("id, tipo_accion, resultado, metadata, created_at, fase, request_id, leads(nombre, telefono)")
    .order("created_at", { ascending: false })
    .limit(filtros?.limit ?? 600);

  if (filtros?.tipoAccion) q = q.eq("tipo_accion", filtros.tipoAccion);
  if (filtros?.fase)       q = q.eq("fase", filtros.fase);
  if (filtros?.desde)      q = q.gte("created_at", filtros.desde);
  if (filtros?.hasta)      q = q.lte("created_at", filtros.hasta);
  if (filtros?.leadId)     q = q.eq("lead_id", filtros.leadId);

  const { data, error } = await q;
  if (error) throw new Error(`[log-ia] ${error.message}`);
  return (data ?? []) as unknown as LogIARow[];
}

// Separa registros en grupos (por request_id) y filas legacy (sin request_id)
export function agruparRegistros(registros: LogIARow[]): {
  grupos: GrupoLogIA[];
  legacy: LogIARow[];
} {
  const legacy: LogIARow[] = [];
  const map = new Map<string, LogIARow[]>();

  for (const r of registros) {
    if (!r.request_id) { legacy.push(r); continue; }
    const arr = map.get(r.request_id) ?? [];
    arr.push(r);
    map.set(r.request_id, arr);
  }

  const grupos: GrupoLogIA[] = [];
  for (const [request_id, logs] of map) {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    grupos.push({ request_id, tipo_accion: sorted[0].tipo_accion, timestamp: sorted[0].created_at, logs: sorted });
  }

  grupos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { grupos, legacy };
}

// S10.3 — Cola de aprobaciones
export async function crearSugerenciaIA(params: {
  tipo: "pipeline" | "flujo" | "avatar" | "gatillo" | "general";
  titulo: string;
  descripcion: string;
  prioridad?: "urgente" | "importante" | "puede_esperar";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").insert({
    tipo:      params.tipo,
    titulo:    params.titulo,
    descripcion: params.descripcion,
    prioridad: params.prioridad ?? "puede_esperar",
    metadata:  params.metadata ?? {},
  }).then(({ error }) => {
    if (error) console.error("[log-ia] Error creando sugerencia:", error.message);
  });
}
