import { createServiceClient } from "@/lib/supabase/service";
import { generarEmbedding, anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import { obtenerIdentidad, formatearIdentidadParaPrompt } from "@/services/identidad-marca";
import type { TipoRecurso, OrigenRecurso } from "@/lib/supabase/types";

interface VersionRecurso {
  titulo: string;
  contenido: string;
  fecha: string;
}

// S22.4 — Campos enriquecidos para recursos tipo 'servicio'
export type FichaServicio = { caracteristicas?: string | null; beneficios?: string | null; ventajas?: string | null; para_quien_es?: string | null; para_quien_no_es?: string | null };

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
  origen: OrigenRecurso = "interno",
  ficha?: FichaServicio
) {
  const supabase = createServiceClient();
  const embedding = await generarEmbedding(`${titulo}\n${contenido}`);

  const { data, error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("recursos_conocimiento")
    .insert({ tipo, titulo, contenido, embedding, origen, ...(ficha ?? {}) })
    .select()
    .single();

  if (error) throw new Error(`[conocimiento] Error creando recurso: ${error.message}`);

  // S23.5 — Al registrar un servicio nuevo, generar paquete de sugerencias en cola de aprobación
  if (tipo === "servicio" && data?.id) {
    const { generarPaqueteServicioNuevo } = await import("@/lib/ai/paquete-servicio-nuevo");
    void generarPaqueteServicioNuevo(data.id, titulo, contenido).catch(console.error);
  }

  return data;
}

// S2.2 + S2.4 — Actualiza un recurso; guarda versión previa y regenera embedding si cambia el contenido
export async function actualizarRecurso(
  id: string,
  campos: { titulo?: string; contenido?: string; aprobado?: boolean; activo?: boolean } & Partial<FichaServicio>
) {
  const supabase = createServiceClient();

  const { data: actual, error: fetchError } = await supabase
    .from("recursos_conocimiento")
    .select("titulo, contenido, versiones_previas")
    .eq("id", id)
    .single();

  if (fetchError || !actual) throw new Error(`[conocimiento] Recurso no encontrado: ${id}`);

  const cambiaContenido = campos.titulo !== undefined || campos.contenido !== undefined;
  const { titulo: _t, contenido: _c, aprobado: _a, activo: _ac, ...fichaUpdate } = campos;

  if (!cambiaContenido) {
    const { data, error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("recursos_conocimiento")
      .update({ aprobado: campos.aprobado, activo: campos.activo, ...fichaUpdate })
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

  const { data, error } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("recursos_conocimiento")
    .update({
      titulo: campos.titulo,
      contenido: campos.contenido,
      aprobado: campos.aprobado,
      activo: campos.activo,
      embedding: nuevoEmbedding,
      versiones_previas: nuevasVersiones,
      ...fichaUpdate,
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

// 60% tasa de cierre + 40% volumen de uso (cap 50)
function calcularScoreConfianza(uso: number, cierre: number): number {
  return Math.round((cierre / Math.max(uso, 1) * 0.6 + Math.min(uso / 50, 1) * 0.4) * 100) / 100;
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

// S2.8 — Sugiere un recurso nuevo cuando la pregunta no tiene cobertura en KB
export async function sugerirRecursoDesdeQuery(query: string): Promise<void> {
  try {
    // S18.4 — Leer identidad para que los templates generados usen el branding correcto
    const identidad = await obtenerIdentidad().catch(() => null);
    const brandContext = identidad ? `\n\nIDENTIDAD DE MARCA:\n${formatearIdentidadParaPrompt(identidad)}` : "";

    const response = await anthropic.messages.create({
      model: modeloPorTarea("SUGERIR_KB"),
      max_tokens: 400,
      system: `Analiza la pregunta de un lead sobre certificaciones CONOCER en México.
Determina si se debería crear un nuevo recurso en la base de conocimiento para responderla mejor.
Responde SOLO en JSON con este formato exacto:
{"crear": true, "tipo": "faq|objecion|servicio|practica_venta|template_wa|template_email", "titulo": "...", "contenido": "..."}
Si el recurso es un template (template_wa o template_email), aplica la identidad de marca en el contenido: usa el nombre de la empresa, slogan y firma según el canal.
Si la pregunta es demasiado específica, fuera de tema o ya estaría cubierta por FAQs generales, responde: {"crear": false}${brandContext}`,
      messages: [{ role: "user", content: `Pregunta sin cobertura en KB:\n${query}` }],
    });

    const raw = (response.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw) as { crear: boolean; tipo?: TipoRecurso; titulo?: string; contenido?: string };
    if (!json.crear || !json.tipo || !json.titulo || !json.contenido) return;

    await crearRecurso(json.tipo, json.titulo, json.contenido, "ia_sugerido");
  } catch {
    // No bloquear el flujo principal si falla la sugerencia
  }
}

// S2.9 — Extrae y crea recursos desde contenido externo (URL o texto pegado)
export async function procesarFuenteExterna(contenido: string): Promise<number> {
  // S18.4 — Brand context para que los templates extraídos usen el branding correcto
  const identidad = await obtenerIdentidad().catch(() => null);
  const brandContext = identidad ? `\n\nIDENTIDAD DE MARCA:\n${formatearIdentidadParaPrompt(identidad)}` : "";

  const response = await anthropic.messages.create({
    model: modeloPorTarea("SUGERIR_KB"),
    max_tokens: 1500,
    system: `Eres un extractor de conocimiento para un centro de certificación CONOCER en México.
Analiza el contenido y extrae hasta 5 recursos útiles: FAQs, objeciones comunes, descripciones de servicios, prácticas de venta o templates de mensajes.
Responde SOLO en JSON con este formato exacto:
[{"tipo":"faq|objecion|servicio|practica_venta|template_wa|template_email","titulo":"...","contenido":"..."}]
Cuando el tipo sea template_wa o template_email, aplica la identidad de marca: usa el nombre de la empresa, slogan y firma del canal correspondiente.
Si no hay contenido relevante sobre certificaciones laborales, responde: []${brandContext}`,
    messages: [{ role: "user", content: contenido.slice(0, 6000) }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  const items = JSON.parse(raw) as { tipo: TipoRecurso; titulo: string; contenido: string }[];
  let creados = 0;
  for (const item of items) {
    if (!item.tipo || !item.titulo || !item.contenido) continue;
    await crearRecurso(item.tipo, item.titulo, item.contenido, "externo");
    creados++;
  }
  return creados;
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
