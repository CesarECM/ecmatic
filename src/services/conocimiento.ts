import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding } from "@/lib/ai/client";
import type { TipoRecurso, OrigenRecurso } from "@/lib/supabase/types";

interface VersionRecurso {
  titulo: string;
  contenido: string;
  fecha: string;
}

export interface FiltrosRecursos {
  tipo?: TipoRecurso;
  aprobado?: boolean;
  activo?: boolean;
}

// S2.2 — Crea un recurso y genera su embedding automáticamente
export async function crearRecurso(
  tipo: TipoRecurso,
  titulo: string,
  contenido: string,
  origen: OrigenRecurso = "interno"
) {
  const supabase = createServiceClient();
  const embedding = await generarEmbedding(`${titulo}\n${contenido}`);

  const { data, error } = await supabase
    .from("recursos_conocimiento")
    .insert({ tipo, titulo, contenido, embedding, origen })
    .select()
    .single();

  if (error) throw new Error(`[conocimiento] Error creando recurso: ${error.message}`);
  return data;
}

// S2.2 + S2.4 — Actualiza un recurso; guarda versión previa y regenera embedding si cambia el contenido
export async function actualizarRecurso(
  id: string,
  campos: { titulo?: string; contenido?: string; aprobado?: boolean; activo?: boolean }
) {
  const supabase = createServiceClient();

  const { data: actual, error: fetchError } = await supabase
    .from("recursos_conocimiento")
    .select("titulo, contenido, versiones_previas")
    .eq("id", id)
    .single();

  if (fetchError || !actual) throw new Error(`[conocimiento] Recurso no encontrado: ${id}`);

  const cambiaContenido = campos.titulo !== undefined || campos.contenido !== undefined;

  if (!cambiaContenido) {
    const { data, error } = await supabase
      .from("recursos_conocimiento")
      .update({ aprobado: campos.aprobado, activo: campos.activo })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`[conocimiento] Error actualizando recurso: ${error.message}`);
    return data;
  }

  // S2.4 — Archiva la versión actual antes de sobreescribir
  const versionActual: VersionRecurso = {
    titulo: actual.titulo,
    contenido: actual.contenido,
    fecha: new Date().toISOString(),
  };
  const nuevasVersiones = [
    ...(actual.versiones_previas as VersionRecurso[]),
    versionActual,
  ];
  const nuevoEmbedding = await generarEmbedding(
    `${campos.titulo ?? actual.titulo}\n${campos.contenido ?? actual.contenido}`
  );

  const { data, error } = await supabase
    .from("recursos_conocimiento")
    .update({
      titulo: campos.titulo,
      contenido: campos.contenido,
      aprobado: campos.aprobado,
      activo: campos.activo,
      embedding: nuevoEmbedding,
      versiones_previas: nuevasVersiones,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`[conocimiento] Error actualizando recurso: ${error.message}`);
  return data;
}

// S2.2 — Obtiene un recurso por id
export async function obtenerRecurso(id: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("recursos_conocimiento")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`[conocimiento] Recurso no encontrado: ${id}`);
  return data;
}

// S2.2 — Lista recursos con filtros opcionales
export async function listarRecursos(filtros: FiltrosRecursos = {}) {
  const supabase = createServiceClient();

  let query = supabase
    .from("recursos_conocimiento")
    .select("*")
    .order("created_at", { ascending: false });

  if (filtros.tipo !== undefined) query = query.eq("tipo", filtros.tipo);
  if (filtros.aprobado !== undefined) query = query.eq("aprobado", filtros.aprobado);
  if (filtros.activo !== undefined) query = query.eq("activo", filtros.activo);

  const { data, error } = await query;
  if (error) throw new Error(`[conocimiento] Error listando recursos: ${error.message}`);
  return data ?? [];
}

// S2.2 — Aprueba un recurso (sugerido por IA o externo)
export async function aprobarRecurso(id: string) {
  return actualizarRecurso(id, { aprobado: true });
}

// S2.2 — Desactiva un recurso sin eliminarlo
export async function desactivarRecurso(id: string) {
  return actualizarRecurso(id, { activo: false });
}

// S2.3 — Algoritmo de confianza: 60% tasa de cierre + 40% volumen de uso (cap 50)
function calcularScoreConfianza(uso: number, cierre: number): number {
  const ratio = cierre / Math.max(uso, 1);
  const factorUso = Math.min(uso / 50, 1);
  return Math.round((ratio * 0.6 + factorUso * 0.4) * 100) / 100;
}

// S2.3 — Registra que los recursos fueron servidos en una respuesta de IA
export async function registrarUso(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createServiceClient();

  for (const id of ids) {
    const { data } = await supabase
      .from("recursos_conocimiento")
      .select("score_uso, score_cierre")
      .eq("id", id)
      .single();

    if (!data) continue;

    const nuevoUso = data.score_uso + 1;
    await supabase
      .from("recursos_conocimiento")
      .update({
        score_uso: nuevoUso,
        score_confianza: calcularScoreConfianza(nuevoUso, data.score_cierre),
      })
      .eq("id", id);
  }
}

// S2.7 — Tipos de alerta del monitor
export type MotivoAlerta = "sin_uso" | "baja_confianza" | "pendiente_antiguo";

export interface AlertaRecurso {
  id: string;
  titulo: string;
  tipo: string;
  motivo: MotivoAlerta;
}

// S2.7 — Detecta recursos que necesitan atención del administrador
export async function detectarObsoletos(): Promise<AlertaRecurso[]> {
  const supabase = createServiceClient();
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const alertas: AlertaRecurso[] = [];

  const { data: sinUso } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, tipo")
    .eq("activo", true)
    .eq("score_uso", 0)
    .lt("created_at", hace30dias);
  for (const r of sinUso ?? []) alertas.push({ ...r, motivo: "sin_uso" });

  const { data: bajaConfianza } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, tipo")
    .eq("activo", true)
    .eq("aprobado", true)
    .gte("score_uso", 10)
    .lt("score_confianza", 0.3);
  for (const r of bajaConfianza ?? []) alertas.push({ ...r, motivo: "baja_confianza" });

  const { data: pendientes } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, tipo")
    .eq("activo", true)
    .eq("aprobado", false)
    .lt("created_at", hace7dias);
  for (const r of pendientes ?? []) alertas.push({ ...r, motivo: "pendiente_antiguo" });

  return alertas;
}

// S2.3 — Registra que los recursos contribuyeron a un cierre de venta (llamar desde Sprint 3)
export async function registrarCierre(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createServiceClient();

  for (const id of ids) {
    const { data } = await supabase
      .from("recursos_conocimiento")
      .select("score_uso, score_cierre")
      .eq("id", id)
      .single();

    if (!data) continue;

    const nuevoCierre = data.score_cierre + 1;
    await supabase
      .from("recursos_conocimiento")
      .update({
        score_cierre: nuevoCierre,
        score_confianza: calcularScoreConfianza(data.score_uso, nuevoCierre),
      })
      .eq("id", id);
  }
}
