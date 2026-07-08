"use server";

import { revalidatePath } from "next/cache";
import { moverLead } from "@/services/pipeline";
import { obtenerActivo, posponerSeguimientoFlexible } from "@/services/seguimiento-lead";
import {
  removerDelPanel, actualizarOrden, limpiarSugerenciaIA, agregarAlPanel,
  agregarNota, editarNota, eliminarNota,
  registrarMomentum, fijarEnPanel, actualizarCamposPanel,
} from "@/services/oportunidades";
import type { OportunidadNota } from "@/services/oportunidades";
import { logSistema } from "@/services/log-sistema";

const PATH = "/admin/oportunidades";

export async function cerrarGanadoAction(leadId: string) {
  await moverLead(leadId, "Comprado", "admin", "Cerrado desde panel de oportunidades");
  await removerDelPanel(leadId, "cerrado_ganado");
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.cerrar_ganado",
    fase: "ok", leadId });
  revalidatePath(PATH);
}

export async function cerrarPerdidoAction(leadId: string) {
  await moverLead(leadId, "Perdido", "admin", "Cerrado desde panel de oportunidades");
  await removerDelPanel(leadId, "cerrado_perdido");
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.cerrar_perdido",
    fase: "ok", leadId });
  revalidatePath(PATH);
}

export async function posponerSeguimientoAction(leadId: string, horas: number) {
  const seg = await obtenerActivo(leadId);
  if (!seg) return;
  const proximoAt = new Date(Date.now() + horas * 3_600_000);
  await posponerSeguimientoFlexible(seg.id, proximoAt);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.posponer",
    fase: "ok", leadId, resultado: `+${horas}h` });
  revalidatePath(PATH);
}

export async function removerDelPanelAction(leadId: string) {
  await removerDelPanel(leadId, "manual");
  revalidatePath(PATH);
}

// MPS-36: DnD suma momentum al lead movido (posición destino < posición origen = subió = +15)
export async function reordenarAction(items: { id: string; posicion: number; leadId: string }[]) {
  await actualizarOrden(items.map(({ id, posicion }) => ({ id, posicion })));
  // Registrar momentum en todos los leads reordenados (el que subió más es el más importante)
  await Promise.all(
    items.map(({ leadId }) => registrarMomentum(leadId, "drag_reorder").catch(() => null))
  );
  revalidatePath(PATH);
}

export async function desestimnarSugerenciaIAAction(leadId: string) {
  await limpiarSugerenciaIA(leadId);
  revalidatePath(PATH);
}

// MPS-36: anclar/desanclar un lead en su posición actual
export async function fijarEnPanelAction(leadId: string, fijado: boolean) {
  await fijarEnPanel(leadId, fijado);
  revalidatePath(PATH);
}

// MPS-36: editar valor_ticket y/o fecha_compromiso manualmente
export async function actualizarCamposAction(
  oportunidadId: string,
  campos: { valor_ticket?: number | null; fecha_compromiso?: string | null }
) {
  await actualizarCamposPanel(oportunidadId, campos);
  revalidatePath(PATH);
}

// ── CRUD Notas ────────────────────────────────────────────────────────────────

export async function agregarNotaAction(
  oportunidadId: string,
  leadId: string,
  contenido: string
): Promise<OportunidadNota> {
  const nota = await agregarNota(oportunidadId, leadId, contenido);
  revalidatePath(PATH);
  return nota;
}

export async function editarNotaAction(notaId: string, contenido: string): Promise<void> {
  await editarNota(notaId, contenido);
  revalidatePath(PATH);
}

export async function eliminarNotaAction(notaId: string): Promise<void> {
  await eliminarNota(notaId);
  revalidatePath(PATH);
}

// ── AgregarAlPanel ────────────────────────────────────────────────────────────

// MPS-36: sin límite de 10. Suma momentum +10 al agregarlas.
export async function agregarAOportunidadesAction(
  leadId: string
): Promise<{ ok: boolean; mensaje: string }> {
  try {
    await agregarAlPanel(leadId);
    void registrarMomentum(leadId, "agregar_al_panel").catch(() => null);
    revalidatePath(PATH);
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
        revalidatePath(PATH);
        return { ok: true, mensaje: "Reagregado al panel" };
      } catch { /* ignore */ }
      return { ok: false, mensaje: "Este lead ya está en el panel" };
    }
    return { ok: false, mensaje: msg };
  }
}
