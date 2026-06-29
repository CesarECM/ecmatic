// MPS-9 S45.2 — Procesa la señal de retroalimentación cuando un admin edita una respuesta GHL.
// Tier 1: alerta urgente inmediata si el mismo recurso KB acumula ≥ UMBRAL_PATRON edits recientes.
// Tier 2: genera una sugerencia_ia estructurada por Claude (Haiku) para cada edición.
import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { crearAlertaKB } from "@/services/calidad-kb";
import { logSistema } from "@/services/log-sistema";

const UMBRAL_PATRON   = 3;   // edits sobre el mismo recurso en 7 días → alerta urgente
const VENTANA_DIAS    = 7;
const MAX_CONTENIDO   = 300; // caracteres de contexto KB enviados a Claude

interface ItemEdicion {
  mensaje_ia:    string;
  mensaje_final: string | null;
  razon_edicion: string | null;
  contexto:      Record<string, unknown> | null;
  campana:       string;
  nombre:        string | null;
}

interface RecursoKB {
  id:      string;
  titulo:  string;
  contenido: string | null;
}

interface SugerenciaClaudeRaw {
  titulo:       string;
  descripcion:  string;
  prioridad:    "urgente" | "importante" | "puede_esperar";
  que_cambiar:  string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

async function leerItem(itemId: string): Promise<ItemEdicion | null> {
  const { data } = await db()
    .from("ghl_approval_queue")
    .select("mensaje_ia, mensaje_final, razon_edicion, contexto, campana, nombre")
    .eq("id", itemId)
    .maybeSingle() as { data: ItemEdicion | null };
  return data;
}

async function leerRecursosKB(ids: string[]): Promise<RecursoKB[]> {
  if (!ids.length) return [];
  const { data } = await db()
    .from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .in("id", ids) as { data: RecursoKB[] | null };
  return data ?? [];
}

// Tier 1: cuenta edits recientes para los mismos recursosIds y crea alerta urgente si supera umbral.
async function verificarPatronUrgente(recursosIds: string[]): Promise<void> {
  if (!recursosIds.length) return;

  const ventana = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();

  for (const recursoId of recursosIds) {
    const { count } = await db()
      .from("ghl_approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("estado", "editado")
      .eq("feedback_procesado", true)
      .gte("revisado_at", ventana)
      .filter("contexto->recursosIds", "cs", JSON.stringify([recursoId])) as { count: number | null };

    if ((count ?? 0) >= UMBRAL_PATRON - 1) { // -1 porque el actual aún no está marcado
      const { data: recurso } = await db()
        .from("recursos_conocimiento")
        .select("titulo")
        .eq("id", recursoId)
        .maybeSingle() as { data: { titulo: string } | null };

      await crearAlertaKB(
        `Patrón de ediciones: "${recurso?.titulo ?? recursoId}"`,
        `Este recurso ha generado respuestas que fueron corregidas ${UMBRAL_PATRON}+ veces en los últimos ${VENTANA_DIAS} días. Requiere revisión inmediata.`,
        "urgente",
        { recurso_id: recursoId, source: "ghl_edicion_patron", edits_recientes: (count ?? 0) + 1 },
      );
    }
  }
}

// Tier 2: llama a Claude para generar una sugerencia estructurada.
async function generarSugerenciaClaudeIA(
  item: ItemEdicion,
  recursos: RecursoKB[],
): Promise<SugerenciaClaudeRaw | null> {
  const contextoKB = recursos.length
    ? recursos.map((r) => `"${r.titulo}": ${(r.contenido ?? "").slice(0, MAX_CONTENIDO)}`).join("\n")
    : "Sin recursos KB identificados para esta respuesta.";

  const prompt = `Eres auditor de una base de conocimiento de un CRM de ventas de certificaciones CONOCER México.
Un administrador corrigió una respuesta de IA en una campaña de WhatsApp.

RESPUESTA ORIGINAL DE LA IA:
${item.mensaje_ia}

RESPUESTA CORREGIDA POR EL ADMIN:
${item.mensaje_final ?? "(sin texto final)"}

RAZÓN DE LA EDICIÓN (texto del admin):
${item.razon_edicion ?? "(no especificada)"}

RECURSOS KB QUE GENERARON LA RESPUESTA ORIGINAL:
${contextoKB}

Analiza la diferencia entre la respuesta original y la corregida. Determina qué debería cambiar en la base de conocimiento para que la IA no cometa este error de nuevo.

Responde ÚNICAMENTE con JSON válido:
{"titulo":"...","descripcion":"...","prioridad":"urgente|importante|puede_esperar","que_cambiar":"..."}

- titulo: máx 80 chars, describe el problema detectado
- descripcion: máx 200 chars, explica qué cambiar y por qué
- prioridad: urgente si la corrección es sobre precio/requisitos/datos incorrectos, importante si es tono/estilo/omisión, puede_esperar si es preferencia menor
- que_cambiar: instrucción concreta para el editor de KB (máx 150 chars)`;

  try {
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    });
    const raw  = (res.content[0] as { text: string }).text;
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "null") as SugerenciaClaudeRaw | null;
    return json?.titulo ? json : null;
  } catch {
    return null;
  }
}

// ── export principal ──────────────────────────────────────────────────────────

export async function procesarFeedbackEdicion(itemId: string): Promise<void> {
  const traceId = crypto.randomUUID();

  void logSistema({
    categoria: "ia", tipoAccion: "ghl_feedback.procesar_edicion", fase: "inicio", traceId,
    resultado: itemId,
  });

  try {
    const item = await leerItem(itemId);
    if (!item) return;

    const recursosIds = (item.contexto?.recursosIds as string[] | undefined) ?? [];
    const recursos    = await leerRecursosKB(recursosIds);

    // Tier 1 — alerta urgente por patrón (sin Claude)
    await verificarPatronUrgente(recursosIds);

    // Tier 2 — sugerencia estructurada por Claude
    const sugerencia = await generarSugerenciaClaudeIA(item, recursos);

    if (sugerencia) {
      await db().from("sugerencias_ia").insert({
        tipo:        "kb_calidad",
        titulo:      sugerencia.titulo,
        descripcion: sugerencia.descripcion,
        prioridad:   sugerencia.prioridad,
        metadata: {
          source:        "ghl_edicion",
          recurso_ids:   recursosIds,
          campana:       item.campana,
          mensaje_ia:    item.mensaje_ia.slice(0, 300),
          razon_edicion: item.razon_edicion ?? "",
          que_cambiar:   sugerencia.que_cambiar,
        },
      });
    }

    // Marcar como procesado
    await db()
      .from("ghl_approval_queue")
      .update({ feedback_procesado: true, feedback_procesado_at: new Date().toISOString() })
      .eq("id", itemId);

    void logSistema({
      categoria: "ia", tipoAccion: "ghl_feedback.procesar_edicion", fase: "ok", traceId,
      resultado: sugerencia ? `sugerencia: ${sugerencia.titulo.slice(0, 60)}` : "sin sugerencia",
      metadata: { itemId, recursosIds_count: recursosIds.length },
    });
  } catch (err) {
    void logSistema({
      categoria: "ia", tipoAccion: "ghl_feedback.procesar_edicion", fase: "error", traceId,
      resultado: err instanceof Error ? err.message : String(err),
      metadata: { itemId },
    });
  }
}
