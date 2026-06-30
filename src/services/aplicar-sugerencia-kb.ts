// MPS-14 S52 — Aplica una sugerencia kb_calidad al KB real.
// Lee el metadata de la sugerencia, determina la acción y la ejecuta:
//   ghl_edicion       → actualiza el recurso con redacción de IA o contenido del admin
//   Huérfano cobertura → crea nuevo FAQ (aprobado:false → va a ColaKBSeccion)
//   Obsolescencia     → actualiza recurso con contenido del admin (override obligatorio)
//   Duplicado         → desactiva el recurso secundario (id_b)

import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { crearRecurso, actualizarRecurso } from "@/services/conocimiento";
import { logSistema } from "@/services/log-sistema";

export type AccionKB =
  | "recurso_actualizado"
  | "recurso_creado"
  | "recurso_desactivado"
  | "sin_accion";

export interface ResultadoAplicacion {
  accion: AccionKB;
  recursoId?: string;
  titulo?: string;
}

interface MetaSugerencia {
  source?: string;
  recurso_id?: string;
  recurso_ids?: string[];
  id_a?: string;
  id_b?: string;
  categoria_suciedad?: string;
  que_cambiar?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

async function crearSugerenciaEdicionManual(
  recursoId: string,
  tituloOriginal: string,
  contenidoOriginal: string,
  tituloNuevo: string,
  contenidoNuevo: string,
  razonEdicion: string,
) {
  const delta = `Antes: ${contenidoOriginal.slice(0, 300)}\nDespués: ${contenidoNuevo.slice(0, 300)}`;
  await db().from("sugerencias_ia").insert({
    tipo: "kb_calidad",
    prioridad: "importante",
    titulo: `Delta admin: ${tituloOriginal.slice(0, 55)}`,
    descripcion: `Admin modificó "${tituloOriginal}" → "${tituloNuevo}". Razón: "${razonEdicion}". Revisar si otros recursos del KB tienen el mismo problema.`,
    metadata: {
      source: "ghl_edicion_manual",
      recurso_id: recursoId,
      razon_edicion: razonEdicion,
      titulo_original: tituloOriginal,
      titulo_nuevo: tituloNuevo,
      delta,
    },
    aprobado: null,
  });
}

async function leerRecurso(id: string) {
  const { data } = await db()
    .from("recursos_conocimiento")
    .select("id, tipo, titulo, contenido")
    .eq("id", id)
    .maybeSingle() as { data: { id: string; tipo: string; titulo: string; contenido: string } | null };
  return data;
}

async function redactarConKB(
  recurso: { titulo: string; contenido: string },
  instruccion: string,
): Promise<{ titulo: string; contenido: string }> {
  const res = await callClaudeIA("APLICAR_KB", {
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `Eres editor de base de conocimiento de un centro de certificaciones CONOCER México.

RECURSO ACTUAL:
Título: ${recurso.titulo}
Contenido: ${recurso.contenido}

INSTRUCCIÓN DE MEJORA:
${instruccion}

Aplica la instrucción al recurso. Mantén el estilo y tono originales. Cambia solo lo indicado.
Responde únicamente con JSON válido: {"titulo":"...","contenido":"..."}`,
    }],
  });
  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { titulo: string; contenido: string } | null;
  if (!json?.titulo || !json?.contenido) throw new Error("IA no devolvió JSON válido para redacción KB");
  return json;
}

async function generarFAQ(tema: string): Promise<{ titulo: string; contenido: string }> {
  const res = await callClaudeIA("APLICAR_KB", {
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Eres editor de base de conocimiento de un centro de certificaciones CONOCER México.
Crea un recurso FAQ para responder la duda frecuente sobre: "${tema}".
Responde únicamente con JSON válido:
{"titulo":"pregunta exacta que hace el lead (máx 80 chars)","contenido":"respuesta clara y completa (máx 150 palabras)"}
Usa [PRECIO], [FECHA], [REQUISITO] como marcadores para datos específicos que no conoces.`,
    }],
  });
  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { titulo: string; contenido: string } | null;
  if (!json?.titulo || !json?.contenido) throw new Error("IA no devolvió JSON válido para FAQ");
  return json;
}

export async function aplicarSugerenciaKB(
  sugerenciaId: string,
  override?: { titulo: string; contenido: string; razon_edicion?: string },
): Promise<ResultadoAplicacion> {
  const traceId = crypto.randomUUID();
  void logSistema({
    categoria: "ia", tipoAccion: "kb_activo.aplicar", fase: "inicio",
    traceId, resultado: sugerenciaId,
  });

  const { data: s } = await db()
    .from("sugerencias_ia")
    .select("id, titulo, metadata")
    .eq("id", sugerenciaId)
    .maybeSingle() as { data: { id: string; titulo: string; metadata: MetaSugerencia } | null };

  if (!s) throw new Error(`Sugerencia no encontrada: ${sugerenciaId}`);

  const meta = s.metadata ?? {};
  let resultado: ResultadoAplicacion = { accion: "sin_accion" };
  let recursoAntes: { id: string; titulo: string; contenido: string } | null = null;

  try {
    // Caso 1: edición GHL → redactar con IA usando instrucción "que_cambiar"
    if (meta.source === "ghl_edicion" && meta.que_cambiar) {
      const recursoId = meta.recurso_ids?.[0] ?? meta.recurso_id;
      if (recursoId) {
        const recurso = await leerRecurso(recursoId);
        if (recurso) {
          if (override?.razon_edicion) recursoAntes = recurso;
          const nuevo = override ?? await redactarConKB(recurso, meta.que_cambiar);
          await actualizarRecurso(recursoId, { titulo: nuevo.titulo, contenido: nuevo.contenido });
          resultado = { accion: "recurso_actualizado", recursoId, titulo: nuevo.titulo };
        }
      }
    }
    // Caso 2: hueco de cobertura → crear nuevo FAQ (queda en cola KB para aprobación)
    else if (meta.categoria_suciedad === "Huérfano de cobertura") {
      const tema = s.titulo.replace(/^Hueco de cobertura:\s*/i, "").trim();
      const draft = override ?? await generarFAQ(tema);
      const recurso = await crearRecurso("faq", draft.titulo, draft.contenido, "ia_sugerido");
      resultado = { accion: "recurso_creado", recursoId: recurso?.id, titulo: draft.titulo };
    }
    // Caso 3: obsolescencia → requiere contenido del admin (override obligatorio)
    else if (meta.categoria_suciedad === "Obsolescencia parcial" && meta.recurso_id && override) {
      if (override.razon_edicion) {
        const orig = await leerRecurso(meta.recurso_id);
        if (orig) recursoAntes = orig;
      }
      await actualizarRecurso(meta.recurso_id, { titulo: override.titulo, contenido: override.contenido });
      resultado = { accion: "recurso_actualizado", recursoId: meta.recurso_id, titulo: override.titulo };
    }
    // Caso 4: duplicado semántico → desactivar el recurso secundario (id_b)
    else if (meta.categoria_suciedad === "Duplicado semántico" && meta.id_b) {
      await actualizarRecurso(meta.id_b, { activo: false });
      resultado = { accion: "recurso_desactivado", recursoId: meta.id_b };
    }
    // Caso 5: override manual sobre cualquier recurso referenciado
    else if (override) {
      const recursoId = meta.recurso_id ?? meta.recurso_ids?.[0];
      if (recursoId) {
        if (override.razon_edicion) {
          const orig = await leerRecurso(recursoId);
          if (orig) recursoAntes = orig;
        }
        await actualizarRecurso(recursoId, { titulo: override.titulo, contenido: override.contenido });
        resultado = { accion: "recurso_actualizado", recursoId, titulo: override.titulo };
      }
    }

    await db().from("sugerencias_ia").update({ aprobado: true }).eq("id", sugerenciaId);

    // S61 — señal reforzada: delta de edición manual alimenta el KB
    if (override?.razon_edicion && recursoAntes) {
      void crearSugerenciaEdicionManual(
        recursoAntes.id,
        recursoAntes.titulo,
        recursoAntes.contenido,
        override.titulo,
        override.contenido,
        override.razon_edicion,
      ).catch(() => {});
    }

    void logSistema({
      categoria: "ia", tipoAccion: "kb_activo.aplicar", fase: "ok",
      traceId, resultado: resultado.accion,
      metadata: { sugerenciaId, recursoId: resultado.recursoId },
    });
  } catch (err) {
    void logSistema({
      categoria: "ia", tipoAccion: "kb_activo.aplicar", fase: "error",
      traceId, resultado: err instanceof Error ? err.message : String(err),
      metadata: { sugerenciaId },
    });
    throw err;
  }

  return resultado;
}

// Genera una vista previa del cambio propuesto sin aplicarlo al KB.
// Útil para mostrar "antes / después" en el modal de revisión.
export async function previsualizarCambioKB(
  sugerenciaId: string,
): Promise<{ titulo: string; contenido: string } | null> {
  const { data: s } = await db()
    .from("sugerencias_ia")
    .select("metadata")
    .eq("id", sugerenciaId)
    .maybeSingle() as { data: { metadata: MetaSugerencia } | null };
  if (!s) return null;
  const meta = s.metadata ?? {};
  const recursoId = meta.recurso_ids?.[0] ?? meta.recurso_id;
  if (!recursoId || !meta.que_cambiar) return null;
  const recurso = await leerRecurso(recursoId);
  if (!recurso) return null;
  return redactarConKB(recurso, meta.que_cambiar).catch(() => null);
}
