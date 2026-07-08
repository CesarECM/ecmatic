"use server";

import { revalidatePath } from "next/cache";
import { moverLead } from "@/services/pipeline";
import { obtenerActivo, posponerSeguimientoFlexible } from "@/services/seguimiento-lead";
import {
  removerDelPanel, actualizarOrden, limpiarSugerenciaIA, agregarAlPanel,
  agregarNota, editarNota, eliminarNota,
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

export async function reordenarAction(items: { id: string; posicion: number }[]) {
  await actualizarOrden(items);
  revalidatePath(PATH);
}

export async function desestimnarSugerenciaIAAction(leadId: string) {
  await limpiarSugerenciaIA(leadId);
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

export async function agregarAOportunidadesAction(
  leadId: string
): Promise<{ ok: boolean; mensaje: string }> {
  try {
    await agregarAlPanel(leadId);
    revalidatePath(PATH);
    return { ok: true, mensaje: "Agregado al panel de oportunidades" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    if (msg.includes("Panel lleno")) return { ok: false, mensaje: "El panel ya tiene 10 oportunidades" };
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
      try {
        const { createServiceClient } = await import("@/lib/supabase/service");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createServiceClient() as any)
          .from("oportunidades_panel")
          .update({ activo: true })
          .eq("lead_id", leadId);
        revalidatePath(PATH);
        return { ok: true, mensaje: "Reagregado al panel" };
      } catch { /* ignore */ }
      return { ok: false, mensaje: "Este lead ya está en el panel" };
    }
    return { ok: false, mensaje: msg };
  }
}
