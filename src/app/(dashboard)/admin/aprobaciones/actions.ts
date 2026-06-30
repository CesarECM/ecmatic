"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { aprobarEtiqueta, archivarEtiqueta } from "@/services/etiquetas";
import { marcarMensajeEnviado, rechazarMensaje } from "@/services/mensajes-aprobacion";
import { aprobarComprobante, rechazarComprobante } from "@/services/comprobantes";
import { enviarRespuestaWhatsApp } from "@/services/whatsapp-sender";
import { logSistema } from "@/services/log-sistema";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { aplicarSugerenciaKB, type ResultadoAplicacion } from "@/services/aplicar-sugerencia-kb";
import { registrarFalloSugerencia } from "@/services/conocimiento";

const PATH = "/admin/aprobaciones";

export async function aprobarKBAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ aprobado: true }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-kb", fase: "ok", metadata: { kb_id: id } });
  revalidatePath(PATH);
}

export async function actualizarKBAction(id: string, titulo: string, contenido: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ titulo, contenido }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.actualizar-kb", fase: "ok", metadata: { kb_id: id } });
  revalidatePath(PATH);
}

export async function eliminarKBAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").delete().eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.eliminar-kb", fase: "ok", metadata: { kb_id: id } });
  revalidatePath(PATH);
}

export async function aprobarMatrizAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ aprobado: true }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-matriz", fase: "ok", metadata: { matriz_id: id } });
  revalidatePath(PATH);
}

export async function actualizarMatrizAction(id: string, respuesta: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ respuesta_sugerida: respuesta }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.actualizar-matriz", fase: "ok", metadata: { matriz_id: id } });
  revalidatePath(PATH);
}

export async function eliminarMatrizAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").delete().eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.eliminar-matriz", fase: "ok", metadata: { matriz_id: id } });
  revalidatePath(PATH);
}

export async function aprobarSugerenciaAction(id: string) {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("sugerencias_ia")
    .select("titulo, descripcion")
    .eq("id", id)
    .single();
  await supabase.from("sugerencias_ia").update({ aprobado: true }).eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-sugerencia", fase: "ok", metadata: { sugerencia_id: id, titulo: data?.titulo } });
  // S33.6 — Auto-aprobación en cascada por similitud
  if (data?.titulo) {
    const { autoAprobarSimilares } = await import("@/lib/ai/similitud-sugerencias");
    void autoAprobarSimilares(id, data.titulo, data.descripcion ?? "").catch(console.error);
  }
  revalidatePath(PATH);
}

export async function rechazarSugerenciaAction(id: string, feedback: string) {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("sugerencias_ia")
    .select("tipo, metadata")
    .eq("id", id)
    .single();
  await (supabase as any).from("sugerencias_ia").update({
    aprobado: false,
    tipo_decision: "rechazado",
    admin_feedback: feedback,
  }).eq("id", id);
  // Señal negativa leve: si la sugerencia tenía un recurso KB fuente, bajar su score
  const recursoId = data?.metadata?.recurso_id ?? data?.metadata?.recurso_ids?.[0] ?? null;
  if (recursoId && typeof recursoId === "string") {
    void registrarFalloSugerencia(recursoId).catch(() => {});
  }
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.rechazar-sugerencia", fase: "ok", metadata: { sugerencia_id: id, feedback } });
  revalidatePath(PATH);
}

// MPS-14 S52 / MPS-16 S57 — Aprueba una sugerencia kb_calidad aplicando el cambio real al KB.
// tipo_decision: sin_edicion si no hay override, editado si el admin modificó el contenido.
export const aprobarSugerenciaKBAction = safeAction(
  async (id: string, override?: { titulo: string; contenido: string; razon_edicion?: string }): Promise<ResultadoAplicacion> => {
    const supabase = createServiceClient();
    const tipoDecision = override ? "editado" : "sin_edicion";
    await (supabase as any).from("sugerencias_ia").update({
      tipo_decision: tipoDecision,
      ...(override?.razon_edicion ? { admin_feedback: override.razon_edicion } : {}),
    }).eq("id", id);
    const resultado = await aplicarSugerenciaKB(id, override);
    void logSistema({
      categoria: "ui", tipoAccion: "aprobaciones.aplicar-kb", fase: "ok",
      metadata: { sugerencia_id: id, accion: resultado.accion, recurso_id: resultado.recursoId, tipo_decision: tipoDecision },
    });
    revalidatePath(PATH);
    return resultado;
  }
);

// MPS-16 S57 — Elimina permanentemente una sugerencia; feedback obligatorio desde la UI.
export const eliminarSugerenciaAction = safeAction(async (id: string, feedback: string) => {
  const supabase = createServiceClient();
  // Guardar el feedback antes del delete para tener trazabilidad en logs
  const { data } = await (supabase as any)
    .from("sugerencias_ia")
    .select("tipo, metadata")
    .eq("id", id)
    .single();
  const recursoId = data?.metadata?.recurso_id ?? data?.metadata?.recurso_ids?.[0] ?? null;
  if (recursoId && typeof recursoId === "string") {
    void registrarFalloSugerencia(recursoId).catch(() => {});
  }
  await supabase.from("sugerencias_ia").delete().eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.eliminar-sugerencia", fase: "ok", metadata: { sugerencia_id: id, feedback } });
  revalidatePath(PATH);
});

// S33.9 — Acciones de cluster: operan sobre todas las sugerencias del grupo
export async function aprobarClusterAction(clusterId: string) {
  const supabase = createServiceClient();
  const { data: items } = await (supabase as any)
    .from("sugerencias_ia")
    .select("id")
    .eq("cluster_id", clusterId)
    .is("aprobado", null);
  if (items?.length) {
    const ids = (items as { id: string }[]).map((i) => i.id);
    await (supabase as any).from("sugerencias_ia").update({ aprobado: true }).in("id", ids);
  }
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-cluster", fase: "ok", metadata: { cluster_id: clusterId, cantidad: items?.length ?? 0 } });
  revalidatePath(PATH);
}

export async function rechazarClusterAction(clusterId: string) {
  const supabase = createServiceClient();
  const { data: items } = await (supabase as any)
    .from("sugerencias_ia")
    .select("id")
    .eq("cluster_id", clusterId)
    .is("aprobado", null);
  if (items?.length) {
    const ids = (items as { id: string }[]).map((i) => i.id);
    await (supabase as any).from("sugerencias_ia").update({ aprobado: false }).in("id", ids);
  }
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.rechazar-cluster", fase: "ok", metadata: { cluster_id: clusterId, cantidad: items?.length ?? 0 } });
  revalidatePath(PATH);
}

export async function aprobarEtiquetaAction(id: string) {
  await aprobarEtiqueta(id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-etiqueta", fase: "ok", metadata: { etiqueta_id: id } });
  revalidatePath(PATH);
}

export async function archivarEtiquetaAction(id: string) {
  await archivarEtiqueta(id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.archivar-etiqueta", fase: "ok", metadata: { etiqueta_id: id } });
  revalidatePath(PATH);
}

export async function aprobarMensajeAction(id: string, telefono: string, bloques: string[]): Promise<ActionResult> {
  try {
    await enviarRespuestaWhatsApp(telefono, bloques);
    await marcarMensajeEnviado(id);
    void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-mensaje", fase: "ok", metadata: { mensaje_id: id, telefono, bloques_count: bloques.length } });
    revalidatePath(PATH);
    return { data: undefined };
  } catch (err) {
    void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-mensaje", fase: "error", resultado: err instanceof Error ? err.message : String(err), metadata: { mensaje_id: id, telefono } });
    return { error: err instanceof Error ? err.message : "Error al enviar mensaje" };
  }
}

export const rechazarMensajeAction = safeAction(async (id: string) => {
  await rechazarMensaje(id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.rechazar-mensaje", fase: "ok", metadata: { mensaje_id: id } });
  revalidatePath(PATH);
});

export const actualizarMensajeAction = safeAction(async (id: string, respuesta: string) => {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .update({ respuesta, bloques: [respuesta] })
    .eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.actualizar-mensaje", fase: "ok", metadata: { mensaje_id: id } });
  revalidatePath(PATH);
});

export async function aprobarComprobanteAction(id: string) {
  await aprobarComprobante(id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.aprobar-comprobante", fase: "ok", metadata: { comprobante_id: id } });
  revalidatePath(PATH);
}

export async function rechazarComprobanteAction(id: string) {
  await rechazarComprobante(id);
  void logSistema({ categoria: "ui", tipoAccion: "aprobaciones.rechazar-comprobante", fase: "ok", metadata: { comprobante_id: id } });
  revalidatePath(PATH);
}
