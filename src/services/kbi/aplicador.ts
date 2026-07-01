// MPS-20 S76.1 — Aplicador KBI.
// INVARIANTE: aprobar una kbi_sugerencia SIEMPRE resulta en:
//   1. Un cambio real en recursos_conocimiento
//   2. Embedding regenerado (vía crearRecurso / actualizarRecurso)
//   3. sugerencia marcada como estado='aplicada'
// No existe "sin_accion": si tipo_accion no es válido, lanza excepción.

import { createServiceClient } from "@/lib/supabase/service";
import { crearRecurso, actualizarRecurso } from "@/services/conocimiento";
import { registrarSenal } from "@/services/kbi/senales";
import { logSistema } from "@/services/log-sistema";
import type { TipoRecurso } from "@/lib/supabase/types";

export interface ResultadoKBI {
  accion: "creado" | "actualizado" | "desactivado";
  recursoId: string;
  titulo: string;
}

interface KBISugerencia {
  id: string;
  recurso_id: string | null;
  tipo_accion: "crear" | "actualizar" | "desactivar";
  tipo_recurso_nuevo: string | null;
  titulo_propuesto: string;
  contenido_propuesto: string;
  estado: string;
}

// Override opcional: el admin puede editar titulo y contenido antes de aprobar.
export async function aplicarKBISugerencia(
  sugerenciaId: string,
  override?: { titulo?: string; contenido?: string },
): Promise<ResultadoKBI> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const traceId = crypto.randomUUID();

  void logSistema({
    categoria: "ia", tipoAccion: "kbi.aplicador", fase: "inicio",
    traceId, resultado: sugerenciaId,
  });

  const { data: s, error } = await db
    .from("kbi_sugerencias")
    .select("id, recurso_id, tipo_accion, tipo_recurso_nuevo, titulo_propuesto, contenido_propuesto, estado")
    .eq("id", sugerenciaId)
    .maybeSingle() as { data: KBISugerencia | null; error: unknown };

  if (error || !s) throw new Error(`KBI sugerencia no encontrada: ${sugerenciaId}`);
  if (s.estado !== "pendiente") throw new Error(`Sugerencia ya procesada (${s.estado})`);

  const titulo    = override?.titulo    ?? s.titulo_propuesto;
  const contenido = override?.contenido ?? s.contenido_propuesto;

  let resultado: ResultadoKBI;

  // ── CREAR: nuevo recurso faq o regla ─────────────────────────────
  if (s.tipo_accion === "crear") {
    const tipo = (s.tipo_recurso_nuevo ?? "faq") as TipoRecurso;
    const nuevo = await crearRecurso(tipo, titulo, contenido, "ia_sugerido");
    if (!nuevo?.id) throw new Error("crearRecurso no retornó ID");
    // Aprobar el recurso de inmediato (admin ya aprobó la sugerencia)
    await actualizarRecurso(nuevo.id, { aprobado: true });
    resultado = { accion: "creado", recursoId: nuevo.id, titulo };
  }

  // ── ACTUALIZAR: modifica contenido + regenera embedding ──────────
  else if (s.tipo_accion === "actualizar") {
    if (!s.recurso_id) throw new Error("tipo_accion=actualizar requiere recurso_id");
    await actualizarRecurso(s.recurso_id, { titulo, contenido });
    // edicion_admin: señal que baja el bias hacia ese recurso si hay override
    if (override) void registrarSenal("edicion_admin", s.recurso_id).catch(() => null);
    resultado = { accion: "actualizado", recursoId: s.recurso_id, titulo };
  }

  // ── DESACTIVAR: recurso sin uso → fuera del pool de búsqueda ─────
  else if (s.tipo_accion === "desactivar") {
    if (!s.recurso_id) throw new Error("tipo_accion=desactivar requiere recurso_id");
    await actualizarRecurso(s.recurso_id, { activo: false });
    resultado = { accion: "desactivado", recursoId: s.recurso_id, titulo: s.titulo_propuesto };
  }

  else {
    throw new Error(`tipo_accion desconocido: ${s.tipo_accion}`);
  }

  // Marcar como aplicada — siempre después del cambio exitoso
  await db.from("kbi_sugerencias")
    .update({ estado: "aplicada", aplicada_at: new Date().toISOString() })
    .eq("id", sugerenciaId);

  void logSistema({
    categoria: "ia", tipoAccion: "kbi.aplicador", fase: "ok",
    traceId, resultado: resultado.accion,
    metadata: { sugerenciaId, recursoId: resultado.recursoId },
  });

  return resultado;
}

// Rechaza una sugerencia: estado='rechazada' + señal negativa si aplica.
export async function rechazarKBISugerencia(
  sugerenciaId: string,
  feedback: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  const { data: s } = await db
    .from("kbi_sugerencias")
    .select("recurso_id")
    .eq("id", sugerenciaId)
    .maybeSingle() as { data: { recurso_id: string | null } | null };

  await db.from("kbi_sugerencias")
    .update({ estado: "rechazada", admin_feedback: feedback })
    .eq("id", sugerenciaId);

  // Señal negativa leve si la sugerencia apuntaba a un recurso existente
  if (s?.recurso_id) {
    void registrarSenal("rechazo_admin", s.recurso_id).catch(() => null);
  }

  void logSistema({
    categoria: "ia", tipoAccion: "kbi.aplicador.rechazar", fase: "ok",
    resultado: sugerenciaId, metadata: { feedback },
  });
}
