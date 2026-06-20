// S21.2 — Procesa votos negativos y los transforma en mejoras accionables.
// Analiza el contexto del mensaje, genera sugerencias IA y las inserta
// en sugerencias_ia para revisión del admin.

import { createServiceClient } from "@/lib/supabase/service";
import { analizarVotoNegativo } from "@/lib/ai/analisis-voto";
import { crearAlertaKB } from "@/services/calidad-kb";

// ── Procesamiento de voto negativo ────────────────────────────────────────

export async function procesarFeedbackNegativo(
  mensajeId: string,
  comentarioAdmin: string | null = null
): Promise<void> {
  try {
    const supabase = createServiceClient();

    // 1. Cargar el mensaje malo y el lead asociado
    const { data: mensaje } = await (supabase as any)
      .from("mensajes")
      .select("lead_id, contenido, intencion_clasificada, created_at")
      .eq("id", mensajeId)
      .single();

    if (!mensaje) return;

    // 2. Cargar el mensaje entrante anterior (la pregunta del lead)
    const { data: anterior } = await (supabase as any)
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", mensaje.lead_id)
      .eq("direccion", "entrante")
      .lt("created_at", mensaje.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 3. Contexto CAGC y pipeline del lead en ese momento
    const [{ data: lead }, { data: cagc }] = await Promise.all([
      supabase.from("leads").select("pipeline_stage").eq("id", mensaje.lead_id).single(),
      (supabase as any)
        .from("lead_cagc_estado")
        .select("fase_numero")
        .eq("lead_id", mensaje.lead_id)
        .single(),
    ]);

    // 4. Analizar con IA
    const sugerencias = await analizarVotoNegativo({
      respuestaMala:   mensaje.contenido as string,
      preguntaLead:    (anterior?.contenido as string) ?? "(sin pregunta previa registrada)",
      comentarioAdmin,
      faseCagc:        (cagc?.fase_numero as number) ?? null,
      pipelineStage:   (lead?.pipeline_stage as string) ?? null,
      intencion:       (mensaje.intencion_clasificada as string) ?? null,
    });

    if (!sugerencias.length) return;

    // 5. Insertar sugerencias según área
    for (const s of sugerencias) {
      if (s.area === "kb") {
        await crearAlertaKB(s.titulo, s.descripcion, s.prioridad, {
          origen: "voto_negativo",
          mensaje_id: mensajeId,
        });
      } else {
        // matriz y pipeline → sugerencias_ia general
        const TIPO_MAP: Record<string, string> = { matriz: "matriz", pipeline: "pipeline" };
        await (supabase as any).from("sugerencias_ia").insert({
          tipo:        TIPO_MAP[s.area] ?? "general",
          titulo:      s.titulo,
          descripcion: s.descripcion,
          prioridad:   s.prioridad,
          metadata:    {
            origen:     "voto_negativo",
            mensaje_id: mensajeId,
            area:       s.area,
          } satisfies Record<string, unknown>,
        });
      }
    }
  } catch (err) {
    console.error("[feedback-votos] Error procesando feedback negativo:", err);
  }
}

// ── Estadísticas de votos por fase CAGC (para auditoría) ─────────────────

export interface TasaVotoPorFase {
  fase:        number;
  buenos:      number;
  malos:       number;
  total:       number;
  tasa_buena:  number; // 0–1
}

export async function obtenerTasaVotosPorFaseCagc(): Promise<TasaVotoPorFase[]> {
  const supabase = createServiceClient();

  // Paso 1: todos los votos con su mensaje_id
  const { data: votos } = await supabase
    .from("votos_respuesta")
    .select("mensaje_id, voto");

  if (!votos?.length) return [];

  // Paso 2: lead_id por mensaje
  const mensajeIds = votos.map((v) => v.mensaje_id);
  const { data: mensajes } = await (supabase as any)
    .from("mensajes")
    .select("id, lead_id")
    .in("id", mensajeIds);

  const leadPorMensaje = new Map<string, string>(
    (mensajes ?? []).map((m: { id: string; lead_id: string }) => [m.id, m.lead_id])
  );

  // Paso 3: fase CAGC por lead
  const leadIds = [...new Set(Object.values(Object.fromEntries(leadPorMensaje)))];
  const { data: cagcEstados } = await (supabase as any)
    .from("lead_cagc_estado")
    .select("lead_id, fase_numero")
    .in("lead_id", leadIds);

  const fasePorLead = new Map<string, number>(
    (cagcEstados ?? []).map((c: { lead_id: string; fase_numero: number }) => [c.lead_id, c.fase_numero])
  );

  // Paso 4: agregar votos por fase
  const porFase = new Map<number, { buenos: number; malos: number }>();
  for (const voto of votos) {
    const leadId = leadPorMensaje.get(voto.mensaje_id);
    if (!leadId) continue;
    const fase = fasePorLead.get(leadId);
    if (fase === undefined) continue;
    const acc = porFase.get(fase) ?? { buenos: 0, malos: 0 };
    if (voto.voto === "bueno") acc.buenos++;
    else acc.malos++;
    porFase.set(fase, acc);
  }

  return Array.from(porFase.entries())
    .map(([fase, { buenos, malos }]) => {
      const total = buenos + malos;
      return { fase, buenos, malos, total, tasa_buena: total > 0 ? buenos / total : 0 };
    })
    .sort((a, b) => a.fase - b.fase);
}
