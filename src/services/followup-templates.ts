// MPS-26 S95+S96 — Biblioteca de templates de seguimiento.
// S95: auto-guardado como Sugerido + embedding async.
// S96: cascade (Conectado > Aprobado > Sugerido) con matching tipo + embedding + Haiku.
import { createServiceClient } from "@/lib/supabase/service";
import { after } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { callClaudeIA, generarEmbedding } from "@/lib/ai/client";
import type { TipoFollowup } from "@/services/followup-config";

export type EstadoTemplate = "sugerido" | "aprobado" | "conectado";

export interface FollowupTemplate {
  id: string;
  tipo: TipoFollowup;
  angulo_id: string | null;
  texto: string;
  estado: EstadoTemplate;
  ghl_workflow_id: string | null;
  uso_count: number;
  respuesta_count: number;
  conversion_count: number;
  created_at: string;
  updated_at: string;
}

interface TemplateConScore extends FollowupTemplate {
  _score?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// ── Genericización ────────────────────────────────────────────────────────────

// Convierte un mensaje específico (con nombre/contexto del lead) en una plantilla
// reutilizable que funcione para cualquier prospecto. Usa Haiku como transformador.
// Fallback: devuelve el texto original si la llamada falla.
async function genericizarTexto(texto: string): Promise<string> {
  const system = `Eres un editor de plantillas de mensajes de ventas para WhatsApp.
Tu tarea: convierte este mensaje en una plantilla reutilizable eliminando lo que lo hace único a un lead específico.

ELIMINA O REEMPLAZA:
- Nombres propios del contacto
- Empleos, cargos, especialidades o empresas específicas del contacto
- Situaciones particulares únicas de ese lead
- Frases que solo tienen sentido para esa persona en ese contexto concreto

CONSERVA:
- El tono y estilo conversacional
- La estructura y longitud del mensaje
- Los links de pago si los hay
- La intención y el ángulo de ventas
- Todo lo relacionado con los servicios de certificación CONOCER

Si el mensaje ya es genérico, devuélvelo sin cambios.

FORMATO: Solo el texto del template. Sin notas, sin explicaciones.`;

  try {
    const resp = await callClaudeIA(
      "GENERICIZAR_TEMPLATE",
      { max_tokens: 300, system, messages: [{ role: "user", content: texto }] },
    );
    const block = resp.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const resultado = block?.text?.trim() ?? "";
    return resultado.length >= 20 ? resultado : texto;
  } catch {
    return texto;
  }
}

// ── S95: Auto-guardado ────────────────────────────────────────────────────────

// Guarda el texto generado como template Sugerido.
// Genericiza el texto antes de persistir: elimina nombres y contextos específicos
// del lead para que el template sea reutilizable con cualquier prospecto.
// El mensaje específico que el admin aprueba no se altera — solo la biblioteca.
export async function guardarTemplateSugerido(params: {
  tipo: TipoFollowup;
  anguloId: string | null;
  texto: string;
}): Promise<string | null> {
  if (params.texto.length < 20) return null;

  // Genericizar antes de persistir (elimina nombre, empleo, situación particular)
  const textoGenerico = await genericizarTexto(params.texto).catch(() => params.texto);
  if (textoGenerico.length < 20) return null;

  // Evitar duplicados exactos de texto genérico por tipo
  const { data: existente } = await db()
    .from("followup_templates")
    .select("id")
    .eq("tipo", params.tipo)
    .eq("texto", textoGenerico)
    .maybeSingle() as { data: { id: string } | null };

  if (existente) return existente.id;

  const { data, error } = await db()
    .from("followup_templates")
    .insert({
      tipo:      params.tipo,
      angulo_id: params.anguloId ?? null,
      texto:     textoGenerico,
      estado:    "sugerido",
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (error || !data) {
    void logSistema({
      categoria: "servicio", tipoAccion: "followup_templates.guardar", fase: "error",
      resultado: String(error), metadata: { tipo: params.tipo },
    });
    return null;
  }

  const templateId = data.id;

  // Embedding del texto genérico (no del original con nombre del lead)
  after(async () => {
    try {
      const embedding = await generarEmbedding(textoGenerico);
      await db()
        .from("followup_templates")
        .update({ embedding: `[${embedding.join(",")}]` })
        .eq("id", templateId);
    } catch (err) {
      void logSistema({
        categoria: "servicio", tipoAccion: "followup_templates.embedding", fase: "error",
        resultado: String(err).slice(0, 200), metadata: { templateId },
      });
    }
  });

  return templateId;
}

// ── S96: Cascade de templates ─────────────────────────────────────────────────

export interface ResultadoCascade {
  template: FollowupTemplate;
  estado: EstadoTemplate;
}

// Retorna el mejor template disponible para este lead o null si no hay candidatos.
// Orden de preferencia: conectado > aprobado > sugerido.
// Matching: tipo exacto + no usado con este lead + Haiku selecciona entre top candidatos.
export async function buscarTemplateCascada(params: {
  leadId: string;
  tipo: TipoFollowup;
  historialResumen?: string | null; // últimos mensajes para contexto de Haiku
}): Promise<ResultadoCascade | null> {
  const { leadId, tipo, historialResumen } = params;

  // IDs de templates ya usados con este lead (evitar repetición)
  const { data: yaUsados } = await db()
    .from("followup_template_uso_lead")
    .select("template_id")
    .eq("lead_id", leadId) as { data: { template_id: string }[] | null };

  const idsExcluidos = (yaUsados ?? []).map((r) => r.template_id);

  // Buscar candidatos por orden de prioridad de estado
  for (const estado of ["conectado", "aprobado", "sugerido"] as EstadoTemplate[]) {
    let query = db()
      .from("followup_templates")
      .select("*")
      .eq("tipo", tipo)
      .eq("estado", estado)
      .order("uso_count", { ascending: false }) // preferir más probados
      .limit(5);

    if (idsExcluidos.length > 0) {
      query = query.not("id", "in", `(${idsExcluidos.join(",")})`);
    }

    const { data: candidatos } = await query as { data: TemplateConScore[] | null };
    if (!candidatos?.length) continue;

    // Si hay un solo candidato, usarlo directamente
    if (candidatos.length === 1) {
      void logSistema({
        categoria: "servicio", tipoAccion: `cascade.hit.${estado}`, fase: "ok",
        leadId, resultado: `template:${candidatos[0].id.slice(-8)}`,
        metadata: { tipo, estado },
      });
      return { template: candidatos[0], estado };
    }

    // Con varios candidatos: Haiku elige el más apropiado para el contexto
    const elegido = await elegirMejorTemplate(candidatos, historialResumen, tipo);
    if (elegido) {
      void logSistema({
        categoria: "servicio", tipoAccion: `cascade.hit.${estado}`, fase: "ok",
        leadId, resultado: `template:${elegido.id.slice(-8)} (haiku)`,
        metadata: { tipo, estado, candidatos: candidatos.length },
      });
      return { template: elegido, estado };
    }
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "cascade.miss", fase: "ok",
    leadId, metadata: { tipo },
  });
  return null;
}

// Haiku elige entre candidatos el más apropiado para el historial actual del lead
async function elegirMejorTemplate(
  candidatos: FollowupTemplate[],
  historialResumen: string | null | undefined,
  tipo: string,
): Promise<FollowupTemplate | null> {
  if (!candidatos.length) return null;

  const lista = candidatos
    .map((t, i) => `[${i + 1}] ${t.texto.slice(0, 200)}`)
    .join("\n\n");

  const system = `Eres un selector de mensajes de seguimiento para WhatsApp de ventas B2C.
Tu única tarea: elegir el mensaje más apropiado para el contexto actual de la conversación.
Responde ÚNICAMENTE con el número entre corchetes del mensaje elegido, por ejemplo: [2]
Si ninguno es apropiado, responde: [0]`;

  const userContent = `TIPO DE SEGUIMIENTO: ${tipo}
HISTORIAL RECIENTE:
${historialResumen ?? "(sin historial disponible)"}

CANDIDATOS:
${lista}

¿Cuál es el más apropiado?`;

  try {
    const resp = await callClaudeIA(
      "SELECCIONAR_TEMPLATE",
      {
        max_tokens: 10,
        system,
        messages: [{ role: "user", content: userContent }],
      },
    );

    const block = resp.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const match = block?.text.match(/\[(\d+)\]/);
    const idx = match ? parseInt(match[1], 10) : 0;

    if (idx < 1 || idx > candidatos.length) return null;
    return candidatos[idx - 1] ?? null;
  } catch {
    // Fallback: primer candidato si Haiku falla
    return candidatos[0] ?? null;
  }
}

// ── Uso y estadísticas ────────────────────────────────────────────────────────

export async function registrarUsoTemplate(
  templateId: string,
  leadId: string,
  seguimientoId: string | null,
): Promise<void> {
  await Promise.all([
    // Marcar como usado con este lead — upsert ignorando duplicados (PK compuesto)
    db()
      .from("followup_template_uso_lead")
      .upsert(
        { template_id: templateId, lead_id: leadId, seguimiento_id: seguimientoId },
        { onConflict: "template_id,lead_id", ignoreDuplicates: true },
      ),
    // Incremento atómico vía RPC (definida en migration 088)
    db().rpc("increment_template_uso", { p_template_id: templateId }),
  ]);
}

export async function promoverTemplate(
  templateId: string,
  nuevoTexto?: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    estado:     "aprobado",
    updated_at: new Date().toISOString(),
  };

  if (nuevoTexto && nuevoTexto.length >= 20) {
    updates.texto = nuevoTexto;
    // Regenerar embedding async si cambió el texto
    after(async () => {
      try {
        const embedding = await generarEmbedding(nuevoTexto);
        await db()
          .from("followup_templates")
          .update({ embedding: `[${embedding.join(",")}]` })
          .eq("id", templateId);
      } catch { /* silencioso */ }
    });
  }

  const { error } = await db()
    .from("followup_templates")
    .update(updates)
    .eq("id", templateId)
    .eq("estado", "sugerido"); // solo sugeridos se pueden promover desde aquí

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "followup_templates.promover", fase: "error",
      resultado: String(error), metadata: { templateId },
    });
  }
}

export async function conectarWorkflow(
  templateId: string,
  ghlWorkflowId: string,
): Promise<void> {
  await db()
    .from("followup_templates")
    .update({
      estado:          "conectado",
      ghl_workflow_id: ghlWorkflowId,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", templateId);
}

export async function incrementarRespuesta(templateId: string): Promise<void> {
  await db().rpc("increment_template_respuesta", { p_template_id: templateId });
}

// S107 — Elimina un template solo si aún está en estado "sugerido".
// Templates aprobados/conectados no se tocan: tienen valor validado de otras aprobaciones.
export async function eliminarTemplateSiSugerido(templateId: string): Promise<void> {
  const { error } = await db()
    .from("followup_templates")
    .delete()
    .eq("id", templateId)
    .eq("estado", "sugerido");

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "followup_templates.eliminar_sugerido", fase: "error",
      resultado: String(error), metadata: { templateId },
    });
    return;
  }
  void logSistema({
    categoria: "servicio", tipoAccion: "followup_templates.eliminar_sugerido", fase: "ok",
    metadata: { templateId },
  });
}

// Actualiza el texto de un template sin cambiar su estado (Aprobado/Conectado).
// Para promover Sugerido→Aprobado usar promoverTemplate().
export async function actualizarTextoTemplate(
  templateId: string,
  nuevoTexto: string,
): Promise<void> {
  if (nuevoTexto.length < 20) return;

  const { error } = await db()
    .from("followup_templates")
    .update({ texto: nuevoTexto, updated_at: new Date().toISOString() })
    .eq("id", templateId);

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "followup_templates.actualizar_texto", fase: "error",
      resultado: String(error), metadata: { templateId },
    });
    return;
  }

  // Regenerar embedding async al cambiar el texto
  after(async () => {
    try {
      const embedding = await generarEmbedding(nuevoTexto);
      await db()
        .from("followup_templates")
        .update({ embedding: `[${embedding.join(",")}]` })
        .eq("id", templateId);
    } catch { /* silencioso */ }
  });
}

// Listado para panel /admin/templates
export async function listarTemplates(filtros?: {
  tipo?: TipoFollowup;
  estado?: EstadoTemplate;
}): Promise<FollowupTemplate[]> {
  let query = db()
    .from("followup_templates")
    .select("*, followup_angulos(codigo, nombre)")
    .order("created_at", { ascending: false });

  if (filtros?.tipo)   query = query.eq("tipo", filtros.tipo);
  if (filtros?.estado) query = query.eq("estado", filtros.estado);

  const { data } = await query as { data: FollowupTemplate[] | null };
  return data ?? [];
}
