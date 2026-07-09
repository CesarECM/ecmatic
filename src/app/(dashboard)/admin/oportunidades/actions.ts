"use server";

import { moverLead } from "@/services/pipeline";
import { obtenerActivo, posponerSeguimientoFlexible } from "@/services/seguimiento-lead";
import {
  removerDelPanel, actualizarOrden, limpiarSugerenciaIA, agregarAlPanel,
  agregarNota, editarNota, eliminarNota,
  registrarMomentum, fijarEnPanel, actualizarCamposPanel,
} from "@/services/oportunidades";
import type { OportunidadNota } from "@/services/oportunidades";
import { logSistema } from "@/services/log-sistema";
import { revalidatePath } from "next/cache";

// Todas las mutaciones finas usan estado optimista en el cliente (MPS-37).
// revalidatePath() se omite aquí para evitar que Next.js 15+ haga un soft-refresh
// automático que reinicializaría el estado local. La página tiene revalidate=0:
// la próxima visita siempre obtiene datos frescos del servidor.

export async function cerrarGanadoAction(leadId: string) {
  await moverLead(leadId, "Comprado", "admin", "Cerrado desde panel de oportunidades");
  await removerDelPanel(leadId, "cerrado_ganado");
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.cerrar_ganado",
    fase: "ok", leadId });
}

export async function cerrarPerdidoAction(leadId: string) {
  await moverLead(leadId, "Perdido", "admin", "Cerrado desde panel de oportunidades");
  await removerDelPanel(leadId, "cerrado_perdido");
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.cerrar_perdido",
    fase: "ok", leadId });
}

export async function posponerSeguimientoAction(leadId: string, horas: number) {
  const seg = await obtenerActivo(leadId);
  if (!seg) return;
  const proximoAt = new Date(Date.now() + horas * 3_600_000);
  await posponerSeguimientoFlexible(seg.id, proximoAt);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.posponer",
    fase: "ok", leadId, resultado: `+${horas}h` });
}

export async function removerDelPanelAction(leadId: string) {
  await removerDelPanel(leadId, "manual");
}

// MPS-36: DnD suma momentum al lead movido (posición destino < posición origen = subió = +15)
export async function reordenarAction(items: { id: string; posicion: number; leadId: string }[]) {
  await actualizarOrden(items.map(({ id, posicion }) => ({ id, posicion })));
  await Promise.all(
    items.map(({ leadId }) => registrarMomentum(leadId, "drag_reorder").catch(() => null))
  );
}

export async function desestimnarSugerenciaIAAction(leadId: string) {
  await limpiarSugerenciaIA(leadId);
}

// MPS-36: anclar/desanclar un lead en su posición actual
export async function fijarEnPanelAction(leadId: string, fijado: boolean) {
  await fijarEnPanel(leadId, fijado);
}

// MPS-36: editar valor_ticket y/o fecha_compromiso manualmente
export async function actualizarCamposAction(
  oportunidadId: string,
  campos: { valor_ticket?: number | null; fecha_compromiso?: string | null }
) {
  await actualizarCamposPanel(oportunidadId, campos);
}

// ── CRUD Notas ────────────────────────────────────────────────────────────────

export async function agregarNotaAction(
  oportunidadId: string,
  leadId: string,
  contenido: string
): Promise<OportunidadNota> {
  const nota = await agregarNota(oportunidadId, leadId, contenido);
  return nota;
}

export async function editarNotaAction(notaId: string, contenido: string): Promise<void> {
  await editarNota(notaId, contenido);
}

export async function eliminarNotaAction(notaId: string): Promise<void> {
  await eliminarNota(notaId);
}

// ── AgregarAlPanel ────────────────────────────────────────────────────────────
// Sí usa revalidatePath: se llama desde otras páginas (ej: lead detail),
// necesita invalidar el router cache del panel para la próxima visita.

export async function agregarAOportunidadesAction(
  leadId: string
): Promise<{ ok: boolean; mensaje: string }> {
  try {
    await agregarAlPanel(leadId);
    void registrarMomentum(leadId, "agregar_al_panel").catch(() => null);
    revalidatePath("/admin/oportunidades");
    return { ok: true, mensaje: "Agregado al panel de oportunidades" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
      try {
        const { createServiceClient } = await import("@/lib/supabase/service");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createServiceClient() as any)
          .from("oportunidades_panel")
          .update({ activo: true })
          .eq("lead_id", leadId);
        void registrarMomentum(leadId, "agregar_al_panel").catch(() => null);
        revalidatePath("/admin/oportunidades");
        return { ok: true, mensaje: "Reagregado al panel" };
      } catch { /* ignore */ }
      return { ok: false, mensaje: "Este lead ya está en el panel" };
    }
    return { ok: false, mensaje: msg };
  }
}
