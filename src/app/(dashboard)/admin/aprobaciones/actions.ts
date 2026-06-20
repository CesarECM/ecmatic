"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { aprobarEtiqueta, archivarEtiqueta } from "@/services/etiquetas";
import { marcarMensajeEnviado, rechazarMensaje } from "@/services/mensajes-aprobacion";
import { aprobarComprobante, rechazarComprobante } from "@/services/comprobantes";
import { enviarRespuestaWhatsApp } from "@/services/whatsapp-sender";

const PATH = "/admin/aprobaciones";

export async function aprobarKBAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ aprobado: true }).eq("id", id);
  revalidatePath(PATH);
}

export async function actualizarKBAction(id: string, titulo: string, contenido: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").update({ titulo, contenido }).eq("id", id);
  revalidatePath(PATH);
}

export async function eliminarKBAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").delete().eq("id", id);
  revalidatePath(PATH);
}

export async function aprobarMatrizAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ aprobado: true }).eq("id", id);
  revalidatePath(PATH);
}

export async function actualizarMatrizAction(id: string, respuesta: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").update({ respuesta_sugerida: respuesta }).eq("id", id);
  revalidatePath(PATH);
}

export async function eliminarMatrizAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("matriz_nd").delete().eq("id", id);
  revalidatePath(PATH);
}

export async function aprobarSugerenciaAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").update({ aprobado: true }).eq("id", id);
  revalidatePath(PATH);
}

export async function rechazarSugerenciaAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").update({ aprobado: false }).eq("id", id);
  revalidatePath(PATH);
}

export async function aprobarEtiquetaAction(id: string) {
  await aprobarEtiqueta(id);
  revalidatePath(PATH);
}

export async function archivarEtiquetaAction(id: string) {
  await archivarEtiqueta(id);
  revalidatePath(PATH);
}

export async function aprobarMensajeAction(id: string, telefono: string, bloques: string[]) {
  await enviarRespuestaWhatsApp(telefono, bloques);
  await marcarMensajeEnviado(id);
  revalidatePath(PATH);
}

export async function rechazarMensajeAction(id: string) {
  await rechazarMensaje(id);
  revalidatePath(PATH);
}

export async function actualizarMensajeAction(id: string, respuesta: string) {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .update({ respuesta, bloques: [respuesta] })
    .eq("id", id);
  revalidatePath(PATH);
}

export async function aprobarComprobanteAction(id: string) {
  await aprobarComprobante(id);
  revalidatePath(PATH);
}

export async function rechazarComprobanteAction(id: string) {
  await rechazarComprobante(id);
  revalidatePath(PATH);
}
