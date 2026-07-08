// MPS-34 — Re-análisis ligero de un solo lead del panel.
// POST /api/admin/oportunidades/analizar-uno
// Llamado desde NotasInline después de guardar notas, o desde la tarjeta individualmente.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { guardarAnalisisIA } from "@/services/oportunidades";
import { actualizarScoreSalud } from "@/services/score-salud";
import { callClaudeIA } from "@/lib/ai/client";
import { logSistema } from "@/services/log-sistema";

async function verificarAdmin(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (secret === process.env.CRON_SECRET) return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: p } = await (createServiceClient() as any)
      .from("profiles").select("rol").eq("id", user.id).single();
    return p?.rol === "admin";
  } catch { return false; }
}

export async function POST(req: Request) {
  if (!await verificarAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { leadId } = await req.json() as { leadId?: string };
  if (!leadId) return NextResponse.json({ error: "leadId requerido" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // Leer datos del lead + notas historial + mensajes
  const [{ data: lead }, mensajesRes, notasRes] = await Promise.all([
    supabase.from("leads")
      .select("id, nombre, pipeline_stage, score_salud, temperamento_inferido, memoria_ia, email, telefono, tags_ghl, created_at")
      .eq("id", leadId).maybeSingle(),
    supabase.from("mensajes").select("direccion, contenido, created_at")
      .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(25),
    supabase.from("oportunidades_notas")
      .select("contenido, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const mensajes = (mensajesRes.data ?? []) as { direccion: string; contenido: string; created_at: string }[];
  const ultimoMensaje = mensajes[0];
  const diasSinContacto = ultimoMensaje
    ? Math.floor((Date.now() - new Date(ultimoMensaje.created_at).getTime()) / 86_400_000)
    : 999;

  const historial = [...mensajes].reverse()
    .map((m) => `[${m.direccion === "entrante" ? "LEAD" : "IA"}] ${m.contenido}`).join("\n");

  const notasRaw = (notasRes.data ?? []) as { contenido: string; created_at: string }[];
  const notasTexto = notasRaw.length
    ? notasRaw.map((n) => {
        const fecha = new Date(n.created_at).toLocaleDateString("es-MX", {
          day: "2-digit", month: "short", year: "numeric",
        });
        return `[${fecha}] ${n.contenido}`;
      }).join("\n")
    : "ninguna";

  const prompt = `Eres un experto en ventas B2C de certificaciones CONOCER en México.
Analiza este prospecto con CRITERIOS ESTRICTOS y devuelve JSON exacto.

DATOS:
- Nombre: ${lead.nombre ?? "Desconocido"}
- Etapa: ${lead.pipeline_stage ?? "?"}
- Score salud base: ${lead.score_salud}/100
- DISC: ${lead.temperamento_inferido ?? "no inferido"}
- Email capturado: ${lead.email ? "sí" : "no"}
- Días sin último mensaje: ${diasSinContacto}
- Tags GHL: ${Array.isArray(lead.tags_ghl) ? (lead.tags_ghl as string[]).join(", ") : "ninguno"}
- Memoria conversaciones anteriores: ${lead.memoria_ia ?? "ninguna"}
- Notas del admin (historial cronológico, más reciente primero):
${notasTexto}

HISTORIAL (últimos 25 mensajes):
${historial || "Sin mensajes registrados."}

CRITERIOS DE SCORING (score_cierre 0-100):
- 80-100: Lead confirmó querer proceder, tiene presupuesto, solo falta formalizar
- 60-79: Muy interesado, pregunta activamente por proceso/precio, sin objeción fuerte
- 40-59: Interés medio, responde pero no hay urgencia clara
- 20-39: Interés bajo o lleva más de 14 días sin responder
- 0-19: Sin respuesta >30 días, rechazó explícitamente o barrera insuperable

IMPACTO DE LAS NOTAS DEL ADMIN: Si las notas mencionan urgencia, compromiso verbal, fecha límite o señal de cierre, suma 10-20 puntos.

Responde SOLO JSON (sin markdown):
{
  "resumen_ia": "2-3 oraciones: quién es, en qué etapa REAL está, qué lo motiva o frena",
  "siguiente_accion_ia": "acción concreta y específica para HOY (un paso, no una lista)",
  "score_cierre": <entero 0-100 usando los criterios estrictos de arriba>,
  "razon_score": "1 oración explicando el score con datos concretos de la conversación",
  "ia_sugiere": "<'ninguna'|'cerrar_ganado'|'cerrar_perdido'|'upsell'>",
  "ia_razon": <null o "explicación breve">
}`;

  try {
    const res = await callClaudeIA("OPORTUNIDAD_ANALISIS", {
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }, { leadId });

    const texto = (res.content[0] as { text: string }).text.trim();
    const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    const analisis = {
      resumen_ia:          String(parsed.resumen_ia ?? ""),
      siguiente_accion_ia: String(parsed.siguiente_accion_ia ?? ""),
      score_cierre:        Math.max(0, Math.min(100, Number(parsed.score_cierre) || 0)),
      razon_score:         String(parsed.razon_score ?? ""),
      ia_sugiere:          (["ninguna","cerrar_ganado","cerrar_perdido","upsell"].includes(parsed.ia_sugiere)
                            ? parsed.ia_sugiere : "ninguna") as "ninguna"|"cerrar_ganado"|"cerrar_perdido"|"upsell",
      ia_razon:            parsed.ia_razon ?? null,
    };

    await guardarAnalisisIA(leadId, analisis);
    void actualizarScoreSalud(leadId).catch(() => null);

    return NextResponse.json({ ok: true, ...analisis });
  } catch (err) {
    void logSistema({ categoria: "ia", tipoAccion: "oportunidades.analizar_uno",
      fase: "error", leadId, resultado: err instanceof Error ? err.message.slice(0, 200) : "Error" });
    return NextResponse.json({ error: "Error en análisis" }, { status: 500 });
  }
}
