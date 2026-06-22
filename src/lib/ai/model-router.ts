// S12.3 — Router de modelo IA por tarea. Configurable por env var por módulo.
// Permite usar modelos económicos para tareas simples y potentes para complejas.

export type TareaIA =
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
  | "CONTEXTO"          // S23.1 — actualización incremental del Contexto del lead
  | "PAQUETE_SERVICIO"  // S23.5 — sugerencias automáticas al crear un servicio nuevo
  | "SETTER"            // S31.2 — evalúa si el lead avanzó de fase setter
  | "CUALIFICACION"     // S31.3 — cualifica lead en 3 ejes
  | "OBJECION"          // S31.4 — filtro Condición vs. Objeción
  | "DESCONFIANZA";     // S31.5 — mapeo a Tres Desconfianzas Raíz

// Modelos disponibles en Anthropic (por costo ascendente)
const MODELOS: Record<string, string> = {
  haiku:  "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus:   "claude-opus-4-8",
};

// Defaults por tarea (sin override de env)
const DEFAULTS: Record<TareaIA, keyof typeof MODELOS> = {
  CLASIFICAR:    "haiku",   // clasificación simple → modelo económico
  SUGERIR_KB:    "haiku",
  COMPETIDORES:  "haiku",
  CHURN:         "haiku",
  CAGC_INFERIR:  "haiku",   // clasificación de fase de compra
  RESPUESTA:     "sonnet",  // respuesta conversacional → balanceado
  ENCUESTA:      "sonnet",
  ANALISIS:      "sonnet",  // análisis de transcriptos
  COACHING:      "sonnet",  // coaching de vendedores
  VISION:        "sonnet",  // clasificación de imágenes (requiere visión)
  SENALES:          "haiku",
  LEADMAGNET:       "haiku",
  CONTEXTO:         "haiku",
  PAQUETE_SERVICIO: "haiku",
  SETTER:           "haiku",
  CUALIFICACION:    "haiku",
  OBJECION:         "haiku",
  DESCONFIANZA:     "haiku",
};

// S12.3 — Devuelve el model ID óptimo para la tarea.
// Override con env var AI_MODEL_{TAREA} (ej. AI_MODEL_CLASIFICAR=claude-haiku-4-5-20251001)
export function modeloPorTarea(tarea: TareaIA): string {
  const envKey = `AI_MODEL_${tarea}`;
  const override = process.env[envKey];
  if (override) return override;

  const alias = DEFAULTS[tarea];
  return MODELOS[alias] ?? MODELOS.sonnet;
}

// Panel de configuración: muestra modelos activos por tarea
export function obtenerConfigModelos(): Record<TareaIA, { modelo: string; override: boolean }> {
  const tareas = Object.keys(DEFAULTS) as TareaIA[];
  const config: Record<string, { modelo: string; override: boolean }> = {};

  for (const tarea of tareas) {
    const envKey = `AI_MODEL_${tarea}`;
    const override = process.env[envKey];
    config[tarea] = {
      modelo: override ?? MODELOS[DEFAULTS[tarea]],
      override: !!override,
    };
  }
  return config as Record<TareaIA, { modelo: string; override: boolean }>;
}
