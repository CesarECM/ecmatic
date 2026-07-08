// MPS-36 S124.1/S124.2 — Análisis IA enriquecido: extrae valor_ticket, fecha_compromiso, pregunta_clave.
// Top-10 + en-espera → Sonnet (análisis completo).
// Pool fuera de foco (>10) → Haiku (score básico, sin narrativa).

import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { guardarAnalisisIA, obtenerNotasComoTexto } from "@/services/oportunidades";
import { actualizarScoreSalud } from "@/services/score-salud";
import { logSistema } from "@/services/log-sistema";

interface ResultadoAnalisisSonnet {
  resumen_ia: string;
  siguiente_accion_ia: string;
  score_cierre: number;
  razon_score: string;
  ia_sugiere: "ninguna" | "cerrar_ganado" | "cerrar_perdido" | "upsell";
  ia_razon: string | null;
  valor_ticket_estimado: number | null;
  fecha_compromiso_sugerida: string | null;
  pregunta_clave: string;
}

interface ResultadoAnalisisHaiku {
  score_cierre: number;
  razon_score: string;
  ia_sugiere: "ninguna" | "cerrar_ganado" | "cerrar_perdido" | "upsell";
  pregunta_clave: string;
}

interface LeadParaAnalisis {
  id: string;
  nombre: string | null;
  pipeline_stage: string | null;
  score_salud: number;
  temperamento_inferido: string | null;
  memoria_ia: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supa = () => createServiceClient() as any;

async function obtenerHistorialMensajes(leadId: string): Promise<string> {
  const { data } = await supa()
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

// ── Análisis completo con Sonnet ──────────────────────────────────────────────

async function analizarConSonnet(lead: LeadParaAnalisis, notas: string): Promise<ResultadoAnalisisSonnet> {
  const historial = await obtenerHistorialMensajes(lead.id);
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const prompt = `Eres un experto en ventas B2C de certificaciones laborales CONOCER en México.
Analiza este prospecto con criterios ESTRICTOS. HOY ES: ${hoy}.

DATOS DEL LEAD:
- Nombre: ${lead.nombre ?? "Desconocido"}
- Etapa pipeline: ${lead.pipeline_stage ?? "sin etapa"}
- Score salud base: ${lead.score_salud}/100
- Temperamento DISC: ${lead.temperamento_inferido ?? "no inferido"}
- Memoria conversaciones anteriores: ${lead.memoria_ia ?? "ninguna"}
- Notas del admin (más reciente primero):
${notas}

HISTORIAL DE CONVERSACIÓN (últimos 20 mensajes):
${historial}

CRITERIOS score_cierre (0-100):
- 80-100: confirmó querer proceder, presupuesto listo, solo falta formalizar
- 60-79: muy interesado, pregunta activamente por proceso/precio, sin objeción fuerte
- 40-59: interés medio, responde pero sin urgencia clara
- 20-39: interés bajo o >14 días sin responder
- 0-19: >30 días sin respuesta, rechazó explícitamente o barrera insuperable
Notas con urgencia/compromiso verbal/fecha límite → suma 10-20 puntos.

INSTRUCCIONES ADICIONALES:
- valor_ticket_estimado: si en la conversación se mencionó un precio, costo o inversión específica (número en pesos MXN), extráela. null si no hay dato claro.
- fecha_compromiso_sugerida: si el lead dijo algo como "pago el lunes", "me confirmo el viernes", "lo hablo esta semana" → convierte a ISO 8601 en UTC. null si no hay compromiso temporal.
- pregunta_clave: UNA sola pregunta que César debería poder responder en sus notas para avanzar este lead. Debe ser específica al estado actual (ej: "¿Ya sabe cuántas personas de su empresa necesitan certificarse?"). Máx 15 palabras.

RESPONDE ÚNICAMENTE CON ESTE JSON (sin markdown, sin texto extra):
{
  "resumen_ia": "2-3 oraciones: quién es, etapa REAL, qué lo motiva o frena",
  "siguiente_accion_ia": "acción concreta para HOY (un solo paso específico)",
  "score_cierre": <entero 0-100>,
  "razon_score": "1 oración con datos concretos que justifican el score",
  "ia_sugiere": "<'ninguna'|'cerrar_ganado'|'cerrar_perdido'|'upsell'>",
  "ia_razon": "<null si ninguna, o explicación breve>",
  "valor_ticket_estimado": <número en pesos o null>,
  "fecha_compromiso_sugerida": "<ISO 8601 UTC o null>",
  "pregunta_clave": "<pregunta específica, máx 15 palabras>"
}`;

  const res = await callClaudeIA(
    "OPORTUNIDAD_ANALISIS",
    { max_tokens: 700, messages: [{ role: "user", content: prompt }] },
    { leadId: lead.id }
  );

  const texto  = (res.content[0] as { text: string }).text.trim();
  const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const p = JSON.parse(cleaned) as ResultadoAnalisisSonnet;

  return {
    resumen_ia:               p.resumen_ia          ?? "",
    siguiente_accion_ia:      p.siguiente_accion_ia ?? "",
    score_cierre:             Math.max(0, Math.min(100, Number(p.score_cierre) || 0)),
    razon_score:              p.razon_score          ?? "",
    ia_sugiere:               p.ia_sugiere           ?? "ninguna",
    ia_razon:                 p.ia_razon             ?? null,
    valor_ticket_estimado:    p.valor_ticket_estimado ? Number(p.valor_ticket_estimado) : null,
    fecha_compromiso_sugerida: p.fecha_compromiso_sugerida ?? null,
    pregunta_clave:           p.pregunta_clave       ?? "",
  };
}

// ── Análisis básico con Haiku (pool fuera de foco) ────────────────────────────

async function analizarConHaiku(lead: LeadParaAnalisis, notas: string): Promise<ResultadoAnalisisHaiku> {
  const prompt = `Ventas CONOCER México. Califica este lead rápidamente.

Lead: ${lead.nombre ?? "Desconocido"} | Etapa: ${lead.pipeline_stage ?? "?"} | Score salud: ${lead.score_salud}
Notas admin: ${notas.slice(0, 300)}

JSON sin markdown:
{
  "score_cierre": <0-100>,
  "razon_score": "<1 oración breve>",
  "ia_sugiere": "<'ninguna'|'cerrar_ganado'|'cerrar_perdido'|'upsell'>",
  "pregunta_clave": "<pregunta específica para avanzar este lead, máx 15 palabras>"
}`;

  const res = await callClaudeIA(
    "SELECCIONAR_CANDIDATOS",
    { max_tokens: 200, messages: [{ role: "user", content: prompt }] },
    { leadId: lead.id }
  );

  const texto   = (res.content[0] as { text: string }).text.trim();
  const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const p = JSON.parse(cleaned) as ResultadoAnalisisHaiku;

  return {
    score_cierre:  Math.max(0, Math.min(100, Number(p.score_cierre) || 0)),
    razon_score:   p.razon_score  ?? "",
    ia_sugiere:    p.ia_sugiere   ?? "ninguna",
    pregunta_clave: p.pregunta_clave ?? "",
  };
}

// ── Orquestador ───────────────────────────────────────────────────────────────

export interface LeadParaAnalisisCompleto {
  id: string;
  leadData: LeadParaAnalisis;
  notasAdmin: string;
  usarSonnet: boolean;   // true → top10 + esperando; false → pool fuera de foco
}

export async function analizarOportunidades(
  leads: LeadParaAnalisisCompleto[]
): Promise<{ exitosos: number; errores: number }> {
  let exitosos = 0;
  let errores  = 0;
  const BATCH  = 3;

  for (let i = 0; i < leads.length; i += BATCH) {
    const lote = leads.slice(i, i + BATCH);
    await Promise.all(
      lote.map(async ({ leadData, notasAdmin, usarSonnet }) => {
        try {
          if (usarSonnet) {
            const r = await analizarConSonnet(leadData, notasAdmin);
            await guardarAnalisisIA(leadData.id, {
              resumen_ia:          r.resumen_ia,
              siguiente_accion_ia: r.siguiente_accion_ia,
              score_cierre:        r.score_cierre,
              razon_score:         r.razon_score,
              ia_sugiere:          r.ia_sugiere,
              ia_razon:            r.ia_razon,
              valor_ticket:        r.valor_ticket_estimado,
              fecha_compromiso:    r.fecha_compromiso_sugerida,
              pregunta_clave:      r.pregunta_clave,
            });
          } else {
            const r = await analizarConHaiku(leadData, notasAdmin);
            await guardarAnalisisIA(leadData.id, {
              resumen_ia:          "",
              siguiente_accion_ia: "",
              score_cierre:        r.score_cierre,
              razon_score:         r.razon_score,
              ia_sugiere:          r.ia_sugiere,
              ia_razon:            null,
              pregunta_clave:      r.pregunta_clave,
            });
          }
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

// ── Preparar leads para análisis desde la BD ──────────────────────────────────

export async function prepararLeadsParaAnalisis(): Promise<LeadParaAnalisisCompleto[]> {
  const { listarTodosActivos } = await import("@/services/oportunidades");
  const { top10, esperando, seguimiento } = await listarTodosActivos();

  // Top10 + esperando → Sonnet; seguimiento → Haiku
  const sonnetIds = new Set([...top10, ...esperando].map((op) => op.lead_id));

  const todos = [...top10, ...esperando, ...seguimiento];

  const conNotas = await Promise.all(
    todos.map(async (op) => ({
      id: op.lead_id,
      leadData: {
        id:                    op.lead_id,
        nombre:                op.leads?.nombre ?? null,
        pipeline_stage:        op.leads?.pipeline_stage ?? null,
        score_salud:           op.leads?.score_salud ?? 0,
        temperamento_inferido: op.leads?.temperamento_inferido ?? null,
        memoria_ia:            null as string | null,
      },
      notasAdmin: await obtenerNotasComoTexto(op.lead_id),
      usarSonnet: sonnetIds.has(op.lead_id),
    }))
  );

  // Cargar memoria_ia en paralelo
  const ids = todos.map((op) => op.lead_id);
  const { data: memorias } = await supa()
    .from("leads")
    .select("id, memoria_ia")
    .in("id", ids);

  const memoriaMap = new Map(
    (memorias ?? []).map((m: { id: string; memoria_ia: string | null }) => [m.id, m.memoria_ia])
  );

  return conNotas.map((item) => ({
    ...item,
    leadData: { ...item.leadData, memoria_ia: (memoriaMap.get(item.id) ?? null) as string | null },
  }));
}
