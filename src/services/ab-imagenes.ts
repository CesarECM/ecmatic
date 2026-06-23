// S34.7 — Thompson Sampling para A/B de imágenes por template WA
// Cada par (template_id, imagen_servicio_id) mantiene su Beta(α, β) propia.

import { createServiceClient } from "@/lib/supabase/service";

interface AbImagen {
  id: string;
  template_id: string;
  imagen_servicio_id: string;
  asignaciones: number;
  respuestas: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// ── Thompson Sampling (reusa la implementación de pipeline-ab.ts) ──────────

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randGamma(shape: number): number {
  if (shape < 1) return randGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = randn(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const a = randGamma(alpha), b = randGamma(beta);
  return a + b === 0 ? 0.5 : a / (a + b);
}

// ── API pública ────────────────────────────────────────────────────────────

// Selecciona, usando Thompson Sampling, la imagen óptima para un template.
// Si el template no tiene imágenes asociadas en pipeline_ab_imagenes → null.
export async function seleccionarImagenParaTemplate(
  templateId: string
): Promise<string | null> {
  const { data: filas } = await db()
    .from("pipeline_ab_imagenes")
    .select("id, imagen_servicio_id, asignaciones, respuestas")
    .eq("template_id", templateId) as { data: AbImagen[] | null };

  if (!filas?.length) return null;

  // Muestrea θ de cada Beta y elige el más alto
  let mejorId: string | null = null;
  let mejorTheta = -1;
  for (const f of filas) {
    const theta = sampleBeta(f.respuestas + 1, f.asignaciones - f.respuestas + 1);
    if (theta > mejorTheta) { mejorTheta = theta; mejorId = f.imagen_servicio_id; }
  }
  return mejorId;
}

// Inicializa el par (template_id, imagen_id) en pipeline_ab_imagenes si no existe.
// Se llama cuando se asocia una imagen a un template.
export async function asegurarParAB(templateId: string, imagenId: string): Promise<void> {
  await db()
    .from("pipeline_ab_imagenes")
    .upsert(
      { template_id: templateId, imagen_servicio_id: imagenId },
      { onConflict: "template_id,imagen_servicio_id", ignoreDuplicates: true }
    );
}

// Registra que se envió la imagen (incrementa asignaciones).
export async function registrarEnvioImagen(
  templateId: string,
  imagenId: string
): Promise<void> {
  const { data } = await db()
    .from("pipeline_ab_imagenes")
    .select("id, asignaciones")
    .eq("template_id", templateId)
    .eq("imagen_servicio_id", imagenId)
    .maybeSingle() as { data: Pick<AbImagen, "id" | "asignaciones"> | null };

  if (!data) return;
  await db()
    .from("pipeline_ab_imagenes")
    .update({ asignaciones: data.asignaciones + 1, updated_at: new Date().toISOString() })
    .eq("id", data.id);
}

// Registra que el lead respondió tras recibir la imagen (incrementa respuestas).
export async function registrarRespuestaImagen(
  templateId: string,
  imagenId: string
): Promise<void> {
  const { data } = await db()
    .from("pipeline_ab_imagenes")
    .select("id, respuestas")
    .eq("template_id", templateId)
    .eq("imagen_servicio_id", imagenId)
    .maybeSingle() as { data: Pick<AbImagen, "id" | "respuestas"> | null };

  if (!data) return;
  await db()
    .from("pipeline_ab_imagenes")
    .update({ respuestas: data.respuestas + 1, updated_at: new Date().toISOString() })
    .eq("id", data.id);
}

// Devuelve el estado actual de todos los pares para un template (para mostrar en UI).
export async function estadoABPorTemplate(
  templateId: string
): Promise<{ imagenId: string; asignaciones: number; respuestas: number; tasa: number }[]> {
  const { data } = await db()
    .from("pipeline_ab_imagenes")
    .select("imagen_servicio_id, asignaciones, respuestas")
    .eq("template_id", templateId) as { data: AbImagen[] | null };

  return (data ?? []).map((f) => ({
    imagenId: f.imagen_servicio_id,
    asignaciones: f.asignaciones,
    respuestas: f.respuestas,
    tasa: f.asignaciones > 0 ? Math.round((f.respuestas / f.asignaciones) * 1000) / 1000 : 0,
  }));
}
