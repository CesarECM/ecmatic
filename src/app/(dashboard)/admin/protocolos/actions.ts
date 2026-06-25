"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  crearProtocolo, actualizarProtocolo, eliminarProtocolo, copiarProtocolo,
  upsertToque, eliminarToque, reordenarToques,
  upsertCriterio, eliminarCriterio,
  upsertEtiqueta, eliminarEtiqueta,
} from "@/services/protocolos-seguimiento";
import { descartarLeadProtocolo, cambiarEstadoProtocolo, registrarResultadoToque } from "@/services/lead-protocolo";
import { logSistema } from "@/services/log-sistema";

const PATH = "/admin/protocolos";

// ── PROTOCOLO ──────────────────────────────────────────────────────────────

export async function crearProtocoloAction(fd: FormData): Promise<void> {
  const id = await crearProtocolo({
    nombre: String(fd.get("nombre") ?? "Nuevo protocolo"),
    descripcion: (fd.get("descripcion") as string | null) || null,
    activo: false,
    etapa_id: (fd.get("etapa_id") as string | null) || null,
    link_agendado: (fd.get("link_agendado") as string | null) || null,
    dias_duracion: Number(fd.get("dias_duracion") ?? 7),
    notas_internas: null,
  });
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.crear", fase: "ok", metadata: { protocolo_id: id } });
  redirect(`${PATH}/${id}`);
}

export async function actualizarProtocoloAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id"));
  await actualizarProtocolo(id, {
    nombre: String(fd.get("nombre") ?? ""),
    descripcion: (fd.get("descripcion") as string | null) || null,
    etapa_id: (fd.get("etapa_id") as string | null) || null,
    link_agendado: (fd.get("link_agendado") as string | null) || null,
    dias_duracion: Number(fd.get("dias_duracion") ?? 7),
    notas_internas: (fd.get("notas_internas") as string | null) || null,
  });
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.actualizar", fase: "ok", metadata: { protocolo_id: id } });
  revalidatePath(`${PATH}/${id}`);
}

export async function copiarProtocoloAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id"));
  const etapaId = String(fd.get("etapa_id"));
  const nuevoId = await copiarProtocolo(id, etapaId);
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.copiar", fase: "ok", metadata: { fuente_id: id, nuevo_id: nuevoId, etapa_id: etapaId } });
  redirect(`${PATH}/${nuevoId}`);
}

export async function toggleActivoAction(id: string, activo: boolean): Promise<void> {
  await actualizarProtocolo(id, { activo });
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.toggle-activo", fase: "ok", metadata: { protocolo_id: id, activo } });
  revalidatePath(`${PATH}/${id}`);
  revalidatePath(PATH);
}

export async function eliminarProtocoloAction(id: string): Promise<void> {
  await eliminarProtocolo(id);
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.eliminar", fase: "ok", metadata: { protocolo_id: id } });
  redirect(PATH);
}

// ── TOQUES ─────────────────────────────────────────────────────────────────

export async function upsertToqueAction(fd: FormData): Promise<void> {
  const protocolo_id = String(fd.get("protocolo_id"));
  await upsertToque({
    ...(fd.get("id") ? { id: String(fd.get("id")) } : {}),
    protocolo_id,
    orden: Number(fd.get("orden") ?? 1),
    nombre: String(fd.get("nombre") ?? ""),
    canal: String(fd.get("canal") ?? "whatsapp") as "whatsapp" | "llamada" | "email",
    dia_offset: Number(fd.get("dia_offset") ?? 0),
    objetivo: (fd.get("objetivo") as string | null) || null,
    guion_principal: (fd.get("guion_principal") as string | null) || null,
    guion_alternativo: (fd.get("guion_alternativo") as string | null) || null,
    nota_interna: (fd.get("nota_interna") as string | null) || null,
    ventana_hora_inicio: (fd.get("ventana_hora_inicio") as string | null) || null,
    ventana_hora_fin: (fd.get("ventana_hora_fin") as string | null) || null,
    template_wa_id: (fd.get("template_wa_id") as string | null) || null,
  });
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.upsert-toque", fase: "ok", metadata: { protocolo_id } });
  revalidatePath(`${PATH}/${protocolo_id}`);
}

export async function eliminarToqueAction(id: string, protocoloId: string): Promise<void> {
  await eliminarToque(id);
  void logSistema({ categoria: "ui", tipoAccion: "protocolos.eliminar-toque", fase: "ok", metadata: { toque_id: id } });
  revalidatePath(`${PATH}/${protocoloId}`);
}

export async function reordenarToquesAction(toques: { id: string; orden: number }[], protocoloId: string): Promise<void> {
  await reordenarToques(toques);
  revalidatePath(`${PATH}/${protocoloId}`);
}

// ── CRITERIOS ──────────────────────────────────────────────────────────────

export async function upsertCriterioAction(fd: FormData): Promise<void> {
  const protocolo_id = String(fd.get("protocolo_id"));
  await upsertCriterio({
    ...(fd.get("id") ? { id: String(fd.get("id")) } : {}),
    protocolo_id,
    orden: Number(fd.get("orden") ?? 0),
    senal: String(fd.get("senal") ?? ""),
    diagnostico: String(fd.get("diagnostico") ?? ""),
    accion: String(fd.get("accion") ?? ""),
    etiqueta_resultado: (fd.get("etiqueta_resultado") as string | null) || null,
  });
  revalidatePath(`${PATH}/${protocolo_id}`);
}

export async function eliminarCriterioAction(id: string, protocoloId: string): Promise<void> {
  await eliminarCriterio(id);
  revalidatePath(`${PATH}/${protocoloId}`);
}

// ── ETIQUETAS ──────────────────────────────────────────────────────────────

export async function upsertEtiquetaAction(fd: FormData): Promise<void> {
  const protocolo_id = String(fd.get("protocolo_id"));
  await upsertEtiqueta({
    ...(fd.get("id") ? { id: String(fd.get("id")) } : {}),
    protocolo_id,
    etiqueta: String(fd.get("etiqueta") ?? ""),
    que_significa: (fd.get("que_significa") as string | null) || null,
    que_indica: (fd.get("que_indica") as string | null) || null,
  });
  revalidatePath(`${PATH}/${protocolo_id}`);
}

export async function eliminarEtiquetaAction(id: string, protocoloId: string): Promise<void> {
  await eliminarEtiqueta(id);
  revalidatePath(`${PATH}/${protocoloId}`);
}

// ── LEAD-PROTOCOLO (acciones desde ficha del lead) ─────────────────────────

export async function descartarLeadProtocoloAction(
  leadProtocoloId: string, etiqueta: string, leadId: string
): Promise<void> {
  await descartarLeadProtocolo(leadProtocoloId, etiqueta);
  revalidatePath(`/admin/leads/${leadId}`);
}

export async function pausarReanudarProtocoloAction(
  leadProtocoloId: string, estado: "activo" | "pausado", leadId: string
): Promise<void> {
  await cambiarEstadoProtocolo(leadProtocoloId, estado);
  revalidatePath(`/admin/leads/${leadId}`);
}

export async function registrarResultadoToqueAction(
  toqueRegistroId: string, resultado: string, notas: string, leadId: string
): Promise<void> {
  await registrarResultadoToque(toqueRegistroId, resultado, notas || undefined);
  revalidatePath(`/admin/leads/${leadId}`);
}
