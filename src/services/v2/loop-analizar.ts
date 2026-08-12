import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { sincronizarFechaReactivacionGHL, sincronizarScoreUrgenciaGHL } from "./sync-hacia-ghl";
import { buscarKbV2 } from "./kb-search";
import type { V2FaseCagc, V2TipoContactPoint } from "@/lib/supabase/types.v2";

// §7.1 — Desglose estructurado de las 7 señales de probabilidad de cierre
interface SenalesScore {
  tipo_preguntas:      number;  // 0–25: preguntas precio/proceso pesan más que info general
  senales_compra:      number;  // 0–25: presupuesto/fecha decisión/autoridad mencionados explícitamente
  objeciones:          number;  // −25–0: objeciones sin resolver penalizan
  velocidad_respuesta: number;  // 0–15: lead que responde rápido muestra más interés
  progreso_fase:       number;  // −10–10: avanza de fase = positivo; estancado/retrocede = negativo
  origen_lead:         number;  // 0–10: señal de calidad estimada por canal/origen
  notas_relevantes:    number;  // 0–15: información útil en notas de llamadas/videollamadas
}

interface AnalisisIA {
  fase_cagc:          V2FaseCagc;
  razon_cagc:         string;
  producto_servicio:  string | null;
  tipo_contacto:      V2TipoContactPoint;
  razon_contacto:     string;
  score_probabilidad: number;
  score_urgencia:     number;
  senales_score:      SenalesScore;
  razon_score:        string;
  requiere_fusion:    boolean;
  fecha_reactivacion: string | null;
}

type MsgRow = { direccion: string; contenido: string; created_at: string };

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

function clampSignal(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n ?? 0)));
}

function parsearIA(texto: string): AnalisisIA {
  const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const obj = JSON.parse(limpio) as AnalisisIA;
  obj.score_probabilidad = clamp(obj.score_probabilidad ?? 50);
  obj.score_urgencia     = clamp(obj.score_urgencia     ?? 50);
  const s = obj.senales_score ?? ({} as SenalesScore);
  obj.senales_score = {
    tipo_preguntas:      clampSignal(s.tipo_preguntas,      0,   25),
    senales_compra:      clampSignal(s.senales_compra,      0,   25),
    objeciones:          clampSignal(s.objeciones,          -25,  0),
    velocidad_respuesta: clampSignal(s.velocidad_respuesta, 0,   15),
    progreso_fase:       clampSignal(s.progreso_fase,       -10, 10),
    origen_lead:         clampSignal(s.origen_lead,         0,   10),
    notas_relevantes:    clampSignal(s.notas_relevantes,    0,   15),
  };
  return obj;
}

function formatearMensajes(msgs: MsgRow[]): string {
  if (!msgs.length) return "(Sin conversación registrada aún)";
  return msgs
    .map((m) => {
      const rol  = m.direccion === "entrante" ? "Lead" : "ECMatic";
      const hora = new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
      return `[${hora}] ${rol}: ${m.contenido}`;
    })
    .join("\n");
}

// Gradiente de urgencia basado en días hasta fecha_reactivacion (§7.2).
// Sube gradualmente — no binario. Retorna null si no hay fecha.
function gradienteUrgencia(fechaISO: string | null): number | null {
  if (!fechaISO) return null;
  const dias = Math.floor((new Date(fechaISO).getTime() - Date.now()) / 86_400_000);
  if (dias <= 0)  return 95; // vencida
  if (dias <= 1)  return 88;
  if (dias <= 3)  return 78;
  if (dias <= 7)  return 65;
  if (dias <= 14) return 50;
  if (dias <= 30) return 35;
  return 20;
}

// Calcula minutos promedio que el lead tarda en responder tras un mensaje saliente.
// Retorna null si no hay pares suficientes.
function calcularVelocidadRespuesta(msgs: MsgRow[]): number | null {
  const tiempos: number[] = [];
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].direccion === "saliente" && msgs[i + 1].direccion === "entrante") {
      const diff = (new Date(msgs[i + 1].created_at).getTime() - new Date(msgs[i].created_at).getTime()) / 60_000;
      if (diff > 0 && diff < 10_080) tiempos.push(diff); // descartar gaps >7 días
    }
  }
  if (!tiempos.length) return null;
  return Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
}

export async function analizarOportunidad(opId: string): Promise<{ contactPointId: string }> {
  const db = createServiceClient() as any;

  // ── 1. Cargar oportunidad y lead ──────────────────────────────────────────
  const { data: op, error: opErr } = await db
    .from("v2_opportunities")
    .select("*, lead:v2_leads(id, nombre, telefono, ghl_contact_id, origen)")
    .eq("id", opId)
    .single();

  if (opErr || !op) throw new Error(`analizarOportunidad: oportunidad no encontrada (${opId})`);

  const lead = op.lead as {
    id: string; nombre: string | null; telefono: string | null;
    ghl_contact_id: string; origen: string;
  };

  // ── 2. Conversación desde tabla mensajes de v1.7 (vía ghl_contact_id) ────
  let msgs: MsgRow[] = [];
  const { data: v1Lead } = await db
    .from("leads").select("id").eq("ghl_contact_id", lead.ghl_contact_id).maybeSingle();

  if (v1Lead) {
    const { data: rawMsgs } = await db
      .from("mensajes")
      .select("direccion, contenido, created_at")
      .eq("lead_id", v1Lead.id)
      .order("created_at", { ascending: false })
      .limit(20);
    msgs = ((rawMsgs ?? []) as MsgRow[]).reverse();
  }

  const mensajesFormateados = formatearMensajes(msgs);

  // ── 3. Notas de la oportunidad ───────────────────────────────────────────
  const { data: notasRows } = await db
    .from("v2_opportunity_notes")
    .select("contenido, created_at")
    .eq("opportunity_id", opId)
    .order("created_at", { ascending: true });

  const notasTexto = notasRows?.length
    ? (notasRows as { contenido: string }[]).map((n) => `- ${n.contenido}`).join("\n")
    : "(Sin notas)";

  // ── 4. Reglas de conversación activas ────────────────────────────────────
  const { data: reglasRows } = await db
    .from("v2_conversation_rules")
    .select("contenido")
    .eq("activa", true)
    .order("orden", { ascending: true });

  const reglasTexto = reglasRows?.length
    ? (reglasRows as { contenido: string }[]).map((r) => `- ${r.contenido}`).join("\n")
    : "(Sin reglas configuradas)";

  // ── 5. KB relevante — búsqueda semántica (S150.2) ───────────────────────
  const kbQuery = `${op.producto_servicio ?? "certificacion CONOCER"} ${mensajesFormateados.slice(-300)}`;
  const kbRows  = await buscarKbV2(kbQuery, 8);
  const kbTexto = kbRows.length
    ? kbRows.map((k) => `[${k.tipo}] ${k.contenido}`).join("\n")
    : "(KB vacía)";

  // ── 6. Otras oportunidades activas del mismo lead ────────────────────────
  const { data: otrasRows } = await db
    .from("v2_opportunities")
    .select("producto_servicio, fase_cagc")
    .eq("lead_id", lead.id)
    .eq("estado", "activa")
    .neq("id", opId);

  const otrasTexto = otrasRows?.length
    ? (otrasRows as { producto_servicio: string | null; fase_cagc: string }[])
        .map((o) => `- ${o.producto_servicio ?? "Sin producto"} (${o.fase_cagc})`)
        .join("\n")
    : "(Sin otras oportunidades activas)";

  // ── 7. Señales cuantitativas §7.1 + §7.2 (S151.1 + S151.2) ─────────────
  const velocidadMin   = calcularVelocidadRespuesta(msgs);
  const meta           = (op.metadata ?? {}) as Record<string, unknown>;
  const fasePrevia     = (meta.fase_previa    as string | undefined) ?? null;
  const faseCambioAt   = (meta.fase_cambio_at as string | undefined) ?? op.updated_at;
  const diasEnFase     = Math.floor((Date.now() - new Date(faseCambioAt).getTime()) / 86_400_000);

  // §7.2 — Señales para score_urgencia
  const ultimoMsgAt       = msgs.length > 0 ? msgs[msgs.length - 1].created_at : null;
  const diasSinContacto   = ultimoMsgAt
    ? Math.floor((Date.now() - new Date(ultimoMsgAt).getTime()) / 86_400_000)
    : null;
  const fechaReactivDB    = op.fecha_reactivacion as string | null;
  const diasHastaFecha    = fechaReactivDB
    ? Math.floor((new Date(fechaReactivDB).getTime() - Date.now()) / 86_400_000)
    : null;

  const senalesCuantitativas = [
    "## Señales §7.1 — score_probabilidad",
    `Velocidad de respuesta del lead: ${velocidadMin !== null ? `${velocidadMin} min promedio` : "sin datos"}`,
    `Fase antes del análisis anterior: ${fasePrevia ?? "primera vez"}`,
    `Fase actual (antes de este análisis): ${op.fase_cagc}`,
    `Días en la fase actual: ${diasEnFase}`,
    `Origen del lead: ${lead.origen}`,
    "",
    "## Señales §7.2 — score_urgencia",
    `Días desde el último mensaje: ${diasSinContacto !== null ? diasSinContacto : "sin mensajes"}`,
    `Fecha de reactivación en BD: ${fechaReactivDB ?? "no registrada"}`,
    `Días hasta esa fecha: ${diasHastaFecha !== null ? (diasHastaFecha <= 0 ? `VENCIDA (${Math.abs(diasHastaFecha)}d)` : `${diasHastaFecha}d`) : "N/A"}`,
  ].join("\n");

  // ── 8. Llamada a Claude ──────────────────────────────────────────────────
  const fechaHoy = new Date().toISOString().slice(0, 10);

  const system = `Eres el motor de análisis CAGC de ECMatic, CRM de Centro ECM — empresa que certifica personas bajo los estándares CONOCER en México.

Tu tarea: analizar la conversación y determinar la fase CAGC actual, el siguiente punto de contacto y scores actualizados.

Fecha actual (UTC): ${fechaHoy}

FASES CAGC:
- conciencia: Acaba de conocer los servicios, preguntas básicas
- atencion: Interés real, pregunta proceso y requisitos
- generacion: Considera activamente, pregunta precios, fechas, disponibilidad
- cierre: Listo para avanzar, negocia o pregunta cómo proceder

SEÑALES PARA score_probabilidad — evalúa cada una y justifícala en senales_score:
1. tipo_preguntas (0–25): preguntas sobre precio/proceso/requisitos pesan más que info general
2. senales_compra (0–25): presupuesto explícito, fecha de decisión, o autoridad de decisión mencionada
3. objeciones (−25–0): penaliza objeciones sin resolver (precio, tiempo, dudas sin respuesta)
4. velocidad_respuesta (0–15): lead que responde rápido muestra más compromiso
5. progreso_fase (−10–10): avanzar de fase = positivo; estancarse o retroceder = negativo
6. origen_lead (0–10): canal de origen como señal de intención inicial
7. notas_relevantes (0–15): notas de llamadas/videollamadas con información de avance real

REGLAS DE CONVERSACIÓN ACTIVAS:
${reglasTexto}

CONOCIMIENTO DISPONIBLE (KB):
${kbTexto}

Responde EXCLUSIVAMENTE con JSON válido. Sin markdown, sin explicaciones fuera del JSON.`;

  const userMsg = `## Lead
Nombre: ${lead.nombre ?? "Desconocido"}
Teléfono: ${lead.telefono ?? "No registrado"}
Producto/servicio inferido: ${op.producto_servicio ?? "No determinado aún"}

## Señales cuantitativas calculadas (§7.1)
${senalesCuantitativas}

## Conversación reciente (más antigua → más nueva)
${mensajesFormateados}

## Notas de la oportunidad
${notasTexto}

## Otras oportunidades activas del mismo lead
${otrasTexto}

---
Responde con este JSON exacto:
{
  "fase_cagc": "conciencia" | "atencion" | "generacion" | "cierre",
  "razon_cagc": "explicación breve de por qué asignas esta fase",
  "producto_servicio": "nombre del servicio/certificación inferido, o null",
  "tipo_contacto": "whatsapp" | "email" | "llamada" | "videollamada",
  "razon_contacto": "qué comunicar y por qué este canal",
  "score_probabilidad": 0-100,
  "score_urgencia": 0-100,
  "senales_score": {
    "tipo_preguntas": 0-25,
    "senales_compra": 0-25,
    "objeciones": -25 a 0,
    "velocidad_respuesta": 0-15,
    "progreso_fase": -10 a 10,
    "origen_lead": 0-10,
    "notas_relevantes": 0-15
  },
  "razon_score": "una línea explicando el score_probabilidad en base a las señales",
  "requiere_fusion": false,
  "fecha_reactivacion": "ISO8601 UTC si el lead mencionó fecha/ventana explícita; null si no"
}`;

  const respuesta = await callClaudeIA(
    "V2_ANALIZAR_LOOP",
    { system, messages: [{ role: "user", content: userMsg }], max_tokens: 1000 },
    { leadId: lead.id }
  );

  const texto    = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";
  const analisis = parsearIA(texto);

  // §7.2 — Aplicar gradiente de urgencia por fecha_reactivacion (S151.2).
  // La fecha más actual es la que acaba de detectar Claude (si detectó una), si no la que ya estaba en BD.
  const fechaParaGradiente = analisis.fecha_reactivacion ?? fechaReactivDB;
  const gradiente          = gradienteUrgencia(fechaParaGradiente);
  const scoreUrgenciaFinal = gradiente !== null
    ? clamp(analisis.score_urgencia * 0.35 + gradiente * 0.65)
    : analisis.score_urgencia;

  const scoreCombinado = clamp(analisis.score_probabilidad * 0.6 + scoreUrgenciaFinal * 0.4);
  const ahora          = new Date().toISOString();

  // Construir metadata actualizada: preservar anterior + señales + tracking de fase
  const metaNueva: Record<string, unknown> = {
    ...meta,
    senales_score:        analisis.senales_score,
    razon_score:          analisis.razon_score ?? "",
    score_urgencia_ia:    analisis.score_urgencia,    // score raw de Claude antes del gradiente
    score_urgencia_grad:  gradiente,                  // valor del gradiente (null si sin fecha)
  };
  if (analisis.fase_cagc !== op.fase_cagc) {
    metaNueva.fase_previa    = op.fase_cagc;
    metaNueva.fase_cambio_at = ahora;
  }

  // ── 9. Actualizar oportunidad ────────────────────────────────────────────
  await db.from("v2_opportunities").update({
    fase_cagc:          analisis.fase_cagc,
    producto_servicio:  analisis.producto_servicio ?? op.producto_servicio,
    score_probabilidad: analisis.score_probabilidad,
    score_urgencia:     scoreUrgenciaFinal,
    score_combinado:    scoreCombinado,
    metadata:           metaNueva,
    ...(analisis.fecha_reactivacion ? { fecha_reactivacion: analisis.fecha_reactivacion } : {}),
    updated_at:         ahora,
  }).eq("id", opId);

  // ── 9b. Sync hacia GHL ───────────────────────────────────────────────────
  if (analisis.fecha_reactivacion && lead.ghl_contact_id) {
    void sincronizarFechaReactivacionGHL(lead.ghl_contact_id, analisis.fecha_reactivacion).catch(() => {});
  }
  if (lead.ghl_contact_id) {
    void sincronizarScoreUrgenciaGHL(lead.ghl_contact_id, scoreUrgenciaFinal).catch(() => {});
  }

  // ── 10. Crear contact_point (pendiente_generacion) ───────────────────────
  const { data: cp, error: cpErr } = await db
    .from("v2_contact_points")
    .insert({
      lead_id:         lead.id,
      opportunity_ids: [opId],
      tipo:            analisis.tipo_contacto,
      estado:          "pendiente_generacion",
      metadata: {
        razon_cagc:      analisis.razon_cagc,
        razon_contacto:  analisis.razon_contacto,
        requiere_fusion: analisis.requiere_fusion,
      },
    })
    .select("id")
    .single();

  if (cpErr || !cp) throw new Error(`analizarOportunidad: no se pudo crear contact_point`);

  // ── S152.2 — Fusión: combinar con otros CPs pendientes si la IA lo pidió ──
  if (analisis.requiere_fusion) {
    const { data: otrosCPs } = await db
      .from("v2_contact_points")
      .select("id, opportunity_ids")
      .eq("lead_id", lead.id)
      .in("estado", ["pendiente_generacion"])
      .eq("es_fusionado", false)
      .neq("id", cp.id);

    const otros = (otrosCPs ?? []) as { id: string; opportunity_ids: string[] }[];
    if (otros.length > 0) {
      const todosOpIds = [...new Set([opId, ...otros.flatMap((o) => o.opportunity_ids)])];
      await db.from("v2_contact_points").update({
        opportunity_ids: todosOpIds,
        es_fusionado:    true,
        updated_at:      new Date().toISOString(),
      }).eq("id", cp.id);
      await db.from("v2_contact_points").delete().in("id", otros.map((o) => o.id));
    }
  }

  return { contactPointId: cp.id };
}
