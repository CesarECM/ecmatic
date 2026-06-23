"use server";

import { revalidatePath } from "next/cache";
import {
  crearPipeline,
  actualizarPipeline,
  eliminarPipeline,
} from "@/services/pipelines-admin";
import {
  crearEtapa,
  actualizarEtapa,
  eliminarEtapa,
} from "@/services/etapas-admin";
import { dispararAuditoriaPipeline } from "@/services/auditor-pipelines";

export async function crearPipelineAction(fd: FormData) {
  const nombre = (fd.get("nombre") as string)?.trim();
  if (!nombre) throw new Error("El nombre es requerido");

  const pipeline = await crearPipeline({
    nombre,
    descripcion:      (fd.get("descripcion") as string) || undefined,
    servicio_id:      (fd.get("servicio_id") as string) || undefined,
    tipo:             (fd.get("tipo") as "tronco" | "rama") || "tronco",
    fase_cagc_inicio: fd.get("fase_cagc_inicio") ? Number(fd.get("fase_cagc_inicio")) : undefined,
    fase_cagc_fin:    fd.get("fase_cagc_fin")    ? Number(fd.get("fase_cagc_fin"))    : undefined,
  });

  void dispararAuditoriaPipeline(pipeline.ruta, "crear_pipeline").catch(console.error);
  revalidatePath("/admin/pipelines");
  return pipeline;
}

export async function actualizarPipelineAction(id: string, fd: FormData) {
  const pipeline = await actualizarPipeline(id, {
    nombre:           (fd.get("nombre") as string)?.trim() || undefined,
    descripcion:      (fd.get("descripcion") as string) || undefined,
    servicio_id:      (fd.get("servicio_id") as string) || null,
    tipo:             (fd.get("tipo") as "tronco" | "rama") || undefined,
    fase_cagc_inicio: fd.get("fase_cagc_inicio") ? Number(fd.get("fase_cagc_inicio")) : null,
    fase_cagc_fin:    fd.get("fase_cagc_fin")    ? Number(fd.get("fase_cagc_fin"))    : null,
    activo:           fd.get("activo") === "true",
  });

  void dispararAuditoriaPipeline(pipeline.ruta, "editar_pipeline").catch(console.error);
  revalidatePath("/admin/pipelines");
  revalidatePath(`/admin/pipelines/${id}`);
  return pipeline;
}

export async function eliminarPipelineAction(id: string) {
  await eliminarPipeline(id);
  revalidatePath("/admin/pipelines");
}

export async function crearEtapaAction(pipelineId: string, ruta: string, fd: FormData) {
  const nombre = (fd.get("nombre") as string)?.trim();
  if (!nombre) throw new Error("El nombre de la etapa es requerido");

  const etapa = await crearEtapa(ruta, {
    nombre,
    fases_cagc:    fd.get("fases_cagc")    ? JSON.parse(fd.get("fases_cagc") as string)   : [],
    es_tronco:     fd.get("es_tronco") === "true",
    sla_dias:      fd.get("sla_dias")      ? Number(fd.get("sla_dias"))      : undefined,
    rotting_dias:  fd.get("rotting_dias")  ? Number(fd.get("rotting_dias"))  : undefined,
    criterios_entrada:  (fd.get("criterios_entrada") as string)  || undefined,
    criterios_salida:   (fd.get("criterios_salida") as string)   || undefined,
    tareas_obligatorias:  fd.get("tareas_obligatorias")  ? JSON.parse(fd.get("tareas_obligatorias") as string)  : [],
    plantillas_mensaje:   fd.get("plantillas_mensaje")   ? JSON.parse(fd.get("plantillas_mensaje") as string)   : [],
    condiciones_workflow: fd.get("condiciones_workflow") ? JSON.parse(fd.get("condiciones_workflow") as string) : [],
    etapas_siguientes: fd.get("etapas_siguientes") ? JSON.parse(fd.get("etapas_siguientes") as string) : [],
  });

  void dispararAuditoriaPipeline(ruta, "crear_etapa").catch(console.error);
  revalidatePath(`/admin/pipelines/${pipelineId}`);
  return etapa;
}

export async function actualizarEtapaAction(
  pipelineId: string,
  ruta: string,
  etapaId: string,
  data: Parameters<typeof actualizarEtapa>[1]
) {
  await actualizarEtapa(etapaId, data);
  void dispararAuditoriaPipeline(ruta, "editar_etapa").catch(console.error);
  revalidatePath(`/admin/pipelines/${pipelineId}`);
}

export async function eliminarEtapaAction(pipelineId: string, ruta: string, etapaId: string) {
  await eliminarEtapa(etapaId);
  void dispararAuditoriaPipeline(ruta, "eliminar_etapa").catch(console.error);
  revalidatePath(`/admin/pipelines/${pipelineId}`);
}
