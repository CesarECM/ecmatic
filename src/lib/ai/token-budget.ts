import { createServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMITE = 8;
const DEFAULT_TOKENS = 500;

export interface ContextoTokens {
  tieneSlotsDisponibles:  boolean;
  tieneProtocoloObjecion: boolean;
  tieneMeetLink:          boolean;
  modoRevelacion:         "oculto" | "preguntando" | "revelado";
}

export interface ContextoAdaptativo {
  limiteHistorial: number;
  maxTokens:       number;
}

async function obtenerScorePromedio(leadId: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createServiceClient() as any)
      .from("ghl_aprobacion_items")
      .select("score_ia")
      .eq("lead_ecmatic_id", leadId)
      .not("score_ia", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!data?.length) return null;

    const scores = (data as { score_ia: number }[]).map((r) => r.score_ia);
    return scores.reduce((s, v) => s + v, 0) / scores.length;
  } catch {
    return null;
  }
}

function limiteDesdeScore(avg: number | null): number {
  if (avg === null) return DEFAULT_LIMITE;
  if (avg > 0.70)   return 6;
  if (avg > 0.50)   return 8;
  if (avg > 0.30)   return 12;
  return 16;
}

function maxTokensDesdeScore(avg: number | null, ctx: ContextoTokens): number {
  let tokens = DEFAULT_TOKENS;

  if (avg !== null) {
    if (avg > 0.70)       tokens -= 50;  // calidad alta → respuestas más concisas
    else if (avg <= 0.40) tokens += 150; // calidad baja → más espacio para elaborar
  }

  if (ctx.tieneSlotsDisponibles)       tokens += 100; // debe listar horarios disponibles
  if (ctx.tieneProtocoloObjecion)      tokens += 75;  // protocolo requiere más elaboración
  if (ctx.tieneMeetLink)               tokens += 50;  // debe compartir link con calidez
  if (ctx.modoRevelacion === "revelado") tokens += 75; // cierre: precio + link + CTA

  return Math.min(Math.max(tokens, 400), 800);
}

// Consulta DB una sola vez y devuelve límite de historial + presupuesto de tokens.
// Centraliza la query de score para S88 (límite historial) y S89 (max_tokens).
export async function calcularContextoAdaptativo(
  leadId: string,
  ctx: ContextoTokens,
): Promise<ContextoAdaptativo> {
  const avg = await obtenerScorePromedio(leadId);
  return {
    limiteHistorial: limiteDesdeScore(avg),
    maxTokens:       maxTokensDesdeScore(avg, ctx),
  };
}
