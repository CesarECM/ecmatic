"use server";

import { revalidatePath } from "next/cache";
import { crearRecurso, aprobarRecurso, actualizarRecurso, procesarFuenteExterna } from "@/services/conocimiento";
import type { FichaServicio, ContextosAplica } from "@/services/conocimiento";
import { createServiceClient } from "@/lib/supabase/service";
import type { TipoRecurso } from "@/lib/supabase/types";
import { logSistema } from "@/services/log-sistema";

function extraerFicha(formData: FormData): FichaServicio {
  const get = (k: string) => (formData.get(k) as string)?.trim() || null;
  return {
    caracteristicas: get("caracteristicas"),
    beneficios: get("beneficios"),
    ventajas: get("ventajas"),
    para_quien_es: get("para_quien_es"),
    para_quien_no_es: get("para_quien_no_es"),
  };
}

// MPS-16 S60 — Extrae contextos_aplica del FormData para practica_venta.
// Los checkboxes envían múltiples valores bajo la misma clave.
function extraerContextos(formData: FormData): ContextosAplica | null {
  const temperamentos = formData.getAll("ctx_temperamento") as string[];
  const etapas       = formData.getAll("ctx_pipeline_stage") as string[];
  if (!temperamentos.length && !etapas.length) return null;
  const ctx: ContextosAplica = {};
  if (temperamentos.length) ctx.temperamento = temperamentos;
  if (etapas.length)        ctx.pipeline_stage = etapas;
  return ctx;
}

export async function crearRecursoAction(formData: FormData) {
  const tipo = formData.get("tipo") as TipoRecurso;
  const titulo = formData.get("titulo") as string;
  const contenido = formData.get("contenido") as string;
  if (!tipo || !titulo?.trim() || !contenido?.trim()) return;

  const ficha = tipo === "servicio" ? extraerFicha(formData) : undefined;
  const recurso = await crearRecurso(tipo, titulo.trim(), contenido.trim(), "interno", ficha);
  await aprobarRecurso(recurso.id);

  // MPS-16 S60 — Guardar contextos de aplicación para practica_venta
  if (tipo === "practica_venta") {
    const ctx = extraerContextos(formData);
    if (ctx) await actualizarRecurso(recurso.id, { contextos_aplica: ctx });
  }

  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.crear", fase: "ok", resultado: titulo.trim(), metadata: { tipo, kb_id: recurso.id } });
  revalidatePath("/admin/conocimiento");
}

export async function aprobarRecursoAction(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await aprobarRecurso(id);
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.aprobar", fase: "ok", metadata: { kb_id: id } });
  revalidatePath("/admin/conocimiento");
}

export async function setActivoAction(formData: FormData) {
  const id = formData.get("id") as string;
  const activo = formData.get("activo") === "true";
  if (!id) return;
  await actualizarRecurso(id, { activo });
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.toggle-activo", fase: "ok", metadata: { kb_id: id, activo } });
  revalidatePath("/admin/conocimiento");
}

export async function editarRecursoAction(formData: FormData) {
  const id = formData.get("id") as string;
  const titulo = (formData.get("titulo") as string)?.trim();
  const contenido = (formData.get("contenido") as string)?.trim();
  if (!id || !titulo || !contenido) return;
  // S22.4 — Incluir ficha de servicio si vienen los campos
  const ficha = formData.has("caracteristicas") ? extraerFicha(formData) : {};
  // MPS-16 S60 — Incluir contextos de aplicación para practica_venta
  const tipo = formData.get("tipo") as string | null;
  const contextos = tipo === "practica_venta" ? { contextos_aplica: extraerContextos(formData) } : {};
  await actualizarRecurso(id, { titulo, contenido, ...ficha, ...contextos });
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.editar", fase: "ok", resultado: titulo, metadata: { kb_id: id } });
  revalidatePath("/admin/conocimiento");
}

export async function restaurarVersionAction(id: string, titulo: string, contenido: string) {
  await actualizarRecurso(id, { titulo, contenido });
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.restaurar-version", fase: "ok", resultado: titulo, metadata: { kb_id: id } });
  revalidatePath("/admin/conocimiento");
}

export async function eliminarRecursoAction(id: string) {
  const supabase = createServiceClient();
  await supabase.from("recursos_conocimiento").delete().eq("id", id);
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.eliminar", fase: "ok", metadata: { kb_id: id } });
  revalidatePath("/admin/conocimiento");
}

export async function importarFuenteAction(formData: FormData) {
  const fuente = (formData.get("fuente") as string)?.trim();
  if (!fuente) return;

  let contenido = fuente;
  if (fuente.startsWith("http://") || fuente.startsWith("https://")) {
    try {
      const res = await fetch(fuente, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      contenido = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    } catch {
      void logSistema({ categoria: "ui", tipoAccion: "conocimiento.importar-fuente", fase: "error", resultado: "Fallo al fetch URL", metadata: { fuente } });
      return;
    }
  }

  await procesarFuenteExterna(contenido);
  void logSistema({ categoria: "ui", tipoAccion: "conocimiento.importar-fuente", fase: "ok", metadata: { fuente: fuente.slice(0, 200) } });
  revalidatePath("/admin/conocimiento");
}
