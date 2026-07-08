// MPS-34 S120.1 — Análisis IA de leads en el panel de oportunidades de cierre.
// Sonnet analiza conversación + contexto y devuelve: resumen, siguiente acción,
// score de cierre (0-100) y sugerencia (ninguna/cerrar_ganado/cerrar_perdido/upsell).

import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { guardarAnalisisIA, obtenerNotasComoTexto } from "@/services/oportunidades";
import { actualizarScoreSalud } from "@/services/score-salud";
import { logSistema } from "@/services/log-sistema";

interface ResultadoAnalisis {
  resumen_ia: string;
  siguiente_accion_ia: string;
  score_cierre: number;
  razon_score: string;
  ia_sugiere: "ninguna" | "cerrar_ganado" | "cerrar_perdido" | "upsell";
  ia_razon: string | null;
}

interface LeadParaAnalisis {
  id: string;
  nombre: string | null;
  pipeline_stage: string | null;
  score_salud: number;
  temperamento_inferido: string | null;
  memoria_ia: string | null;
}

async function obtenerHistorialMensajes(leadId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data } = await supabase
    .from("mensajes")
    .select("direccion, contenido, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data?.length) return "Sin historial de mensajes.";

  return [...data]
    .reverse()
    .map((m: { direccion: string; contenido: string }) =>
      `[${m.direccion === "entrante" ? "LEAD" : "IA"}] ${m.contenido}`
    )
    .join("\n");
}

async function analizarUnLead(lead: LeadParaAnalisis, notasTexto: string): Promise<ResultadoAnalisis> {
  const historial = await obtenerHistorialMensajes(lead.id);

  const prompt = `Eres un experto en ventas B2C de certificaciones laborales CONOCER en México.
Analiza este prospecto con criterios ESTRICTOS y devuelve un JSON EXACTO.

DATOS DEL LEAD:
- Nombre: ${lead.nombre ?? "Desconocido"}
- Etapa pipeline: ${lead.pipeline_stage ?? "sin etapa"}
- Score salud base: ${lead.score_salud}/100
- Temperamento DISC: ${lead.temperamento_inferido ?? "no inferido"}
- Memoria conversaciones anteriores: ${lead.memoria_ia ?? "ninguna"}
- Notas del admin (historial cronológico, más reciente primero):
${notasTexto}

HISTORIAL DE CONVERSACIÓN (últimos 20 mensajes):
${historial}

CRITERIOS DE SCORING ESTRICTOS (score_cierre 0-100):
- 80-100: Lead confirmó querer proceder, tiene presupuesto, solo falta formalizar
- 60-79: Muy interesado, pregunta activamente por proceso/precio, sin objeción fuerte
- 40-59: Interés medio, responde pero no hay urgencia clara
- 20-39: Interés bajo o lleva más de 14 días sin responder
- 0-19: Sin respuesta >30 días, rechazó explícitamente o barrera insuperable

Si las notas del admin mencionan urgencia, compromiso verbal, fecha límite o señal de cierre → suma 10-20 puntos.

RESPONDE ÚNICAMENTE CON ESTE JSON (sin markdown, sin texto extra):
{
  "resumen_ia": "2-3 oraciones: quién es, etapa REAL, qué lo motiva o frena",
  "siguiente_accion_ia": "acción concreta para HOY (un solo paso específico)",
  "score_cierre": <entero 0-100 usando los criterios estrictos de arriba>,
  "razon_score": "1 oración con datos concretos de la conversación que justifican el score",
  "ia_sugiere": "<'ninguna'|'cerrar_ganado'|'cerrar_perdido'|'upsell'>",
  "ia_razon": "<null si ninguna, o explicación breve>"
}

Criterios ia_sugiere:
- cerrar_ganado: confirmó querer proceder, tiene recursos, solo falta formalizar
- cerrar_perdido: >30 días sin responder, rechazó explícitamente o barrera insuperable
- upsell: ya compró y hay señales de segundo servicio (B2B, referidos, upgrade)
- ninguna: continuar trabajando el lead normalmente`;

  const res = await callClaudeIA(
    "OPORTUNIDAD_ANALISIS",
    {
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    },
    { leadId: lead.id }
  );

  const texto = (res.content[0] as { text: string }).text.trim();
  const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const parsed = JSON.parse(cleaned) as ResultadoAnalisis;

  return {
    resumen_ia:          parsed.resumen_ia ?? "",
    siguiente_accion_ia: parsed.siguiente_accion_ia ?? "",
    score_cierre:        Math.max(0, Math.min(100, Number(parsed.score_cierre) || 0)),
    razon_score:         parsed.razon_score ?? "",
    ia_sugiere:          parsed.ia_sugiere ?? "ninguna",
    ia_razon:            parsed.ia_razon ?? null,
  };
}

// Analiza las oportunidades del panel en lotes de 3 en paralelo.
export async function analizarOportunidades(
  leads: Array<{ id: string; leadData: LeadParaAnalisis; notasAdmin: string }>
): Promise<{ exitosos: number; errores: number }> {
  let exitosos = 0;
  let errores = 0;
  const BATCH = 3;

  for (let i = 0; i < leads.length; i += BATCH) {
    const lote = leads.slice(i, i + BATCH);
    await Promise.all(
      lote.map(async ({ id: _id, leadData, notasAdmin }) => {
        try {
          const resultado = await analizarUnLead(leadData, notasAdmin);
          await guardarAnalisisIA(leadData.id, resultado);
          void actualizarScoreSalud(leadData.id).catch(() => null);
          exitosos++;
        } catch (err) {
          errores++;
          void logSistema({
            categoria: "ia", tipoAccion: "oportunidades.analisis",
            fase: "error", leadId: leadData.id,
            resultado: err instanceof Error ? err.message.slice(0, 200) : "Error",
          });
        }
      })
    );
  }

  return { exitosos, errores };
}

// Lee los leads activos del panel y construye el input para analizarOportunidades.
export async function prepararLeadsParaAnalisis(): Promise<
  Array<{ id: string; leadData: LeadParaAnalisis; notasAdmin: string }>
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const { data, error } = await supabase
    .from("oportunidades_panel")
    .select(`
      lead_id,
      leads(id, nombre, pipeline_stage, score_salud, temperamento_inferido, memoria_ia)
    `)
    .eq("activo", true)
    .limit(10);

  if (error) throw new Error(`[analizar-oportunidades] ${error.message}`);

  const filas = (data ?? []).filter(
    (r: { leads: LeadParaAnalisis | null }) => r.leads !== null
  ) as Array<{ lead_id: string; leads: LeadParaAnalisis }>;

  // Cargar notas de cada lead en paralelo
  const conNotas = await Promise.all(
    filas.map(async (r) => ({
      id: r.lead_id,
      leadData: r.leads,
      notasAdmin: await obtenerNotasComoTexto(r.lead_id),
    }))
  );

  return conNotas;
}
