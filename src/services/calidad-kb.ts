import { createServiceClient } from "@/lib/supabase/service";
import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import { registrarUsoIA } from "@/services/alertas-ia";

type PrioridadSugerencia = "urgente" | "importante" | "puede_esperar";

// Helper compartido con calidad-kb-patrones.ts
export async function crearAlertaKB(
  titulo: string,
  descripcion: string,
  prioridad: PrioridadSugerencia = "puede_esperar",
  meta: Record<string, unknown> = {}
) {
  const supabase = createServiceClient();
  await supabase.from("sugerencias_ia").insert({
    tipo: "kb_calidad", titulo, descripcion, prioridad, metadata: meta,
  }).throwOnError();
}

// S15.5 — Recalcula los 5 scores independientes de un recurso.
export async function actualizarScoresMultiples(recursoId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: r } = await supabase
    .from("recursos_conocimiento")
    .select("id, usos, score_uso, score_cierre, updated_at")
    .eq("id", recursoId).single();
  if (!r) return;

  const diasDesdeActualizacion = (Date.now() - new Date(r.updated_at).getTime()) / 86400000;
  const efectividad = r.usos > 0 ? Math.min(1, r.score_cierre / r.usos) : 0.5;
  const vigencia = Math.max(0, Math.exp(-diasDesdeActualizacion / 180));

  await supabase.from("recursos_conocimiento").update({
    score_efectividad: efectividad,
    score_vigencia: vigencia,
  }).eq("id", recursoId);
}

// S15.6 — Detecta duplicados semánticos usando la RPC de pgvector.
export async function detectarDuplicadosSemanticos(): Promise<void> {
  const supabase = createServiceClient();
  const { data: pares } = await supabase.rpc("buscar_duplicados_kb", { umbral: 0.92 });
  if (!pares?.length) return;

  const ids = [...new Set(pares.flatMap((p: { id_a: string; id_b: string }) => [p.id_a, p.id_b]))];
  const { data: recursos } = await supabase
    .from("recursos_conocimiento").select("id, titulo").in("id", ids);
  const mapaRecursos = Object.fromEntries((recursos ?? []).map((r) => [r.id, r.titulo]));

  for (const par of (pares as { id_a: string; id_b: string; similitud: number }[]).slice(0, 5)) {
    await crearAlertaKB(
      "Duplicado semántico detectado",
      `"${mapaRecursos[par.id_a]}" y "${mapaRecursos[par.id_b]}" tienen ${Math.round(par.similitud * 100)}% de similitud semántica.`,
      "importante",
      { id_a: par.id_a, id_b: par.id_b, categoria_suciedad: "Duplicado semántico" }
    );
  }

  for (const id of ids) {
    await supabase.from("recursos_conocimiento")
      .update({ score_consenso: 0.2 }).eq("id", id);
  }
}

// S15.7 — Detecta recursos cuyo contenido puede tener datos puntuales desactualizados.
export async function detectarObsolescenciaParcial(): Promise<void> {
  const supabase = createServiceClient();
  const tresMesesAtras = new Date(Date.now() - 90 * 86400000).toISOString();

  const { data: candidatos } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, contenido")
    .eq("activo", true).eq("aprobado", true)
    .lt("updated_at", tresMesesAtras)
    .in("tipo", ["faq", "servicio", "objecion"])
    .order("score_vigencia", { ascending: true })
    .limit(10);

  if (!candidatos?.length) return;

  const textos = candidatos.map((r) => `[${r.id}] ${r.titulo}: ${r.contenido.slice(0, 200)}`).join("\n---\n");

  const res = await anthropic.messages.create({
    model: modeloPorTarea("ANALISIS"),
    max_tokens: 300,
    messages: [{ role: "user", content: `Eres auditor de base de conocimiento de un centro de certificación CONOCER México.
Analiza estos recursos. Identifica cuáles probablemente contienen datos específicos que pueden haberse desactualizado
(precios, fechas, nombres de procesos, requisitos). Lista solo los IDs afectados en JSON:
{"ids_obsoletos": ["uuid1", "uuid2"]}

Recursos:
${textos}` }],
  });
  void registrarUsoIA("anthropic", res.usage.input_tokens, res.usage.output_tokens).catch(() => {});

  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { ids_obsoletos?: string[] };

  for (const id of json.ids_obsoletos ?? []) {
    const recurso = candidatos.find((r) => r.id === id);
    if (!recurso) continue;
    await crearAlertaKB(
      "Posible obsolescencia parcial",
      `"${recurso.titulo}" no se actualiza en 90+ días y puede tener datos desactualizados.`,
      "puede_esperar",
      { recurso_id: id, categoria_suciedad: "Obsolescencia parcial" }
    );
    await createServiceClient().from("recursos_conocimiento")
      .update({ score_vigencia: 0.3 }).eq("id", id);
  }
}

// S15.8 — Detecta preguntas frecuentes sin recurso KB asociado.
export async function detectarHuecosCobertura(): Promise<void> {
  const supabase = createServiceClient();
  const unaSemanaAtras = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: mensajes } = await supabase
    .from("mensajes")
    .select("contenido")
    .eq("direccion", "entrante")
    .eq("intencion_clasificada", "duda_tecnica")
    .gte("created_at", unaSemanaAtras)
    .limit(30);

  if (!mensajes?.length) return;
  const preguntas = mensajes.map((m) => m.contenido).join("\n");

  const res = await anthropic.messages.create({
    model: modeloPorTarea("ANALISIS"),
    max_tokens: 200,
    messages: [{ role: "user", content: `Analiza estas preguntas de leads sobre certificaciones CONOCER.
Identifica temas recurrentes que probablemente no están cubiertos en una base de conocimiento básica.
Lista máx 3 temas como JSON: {"huecos": ["tema1", "tema2"]}

Preguntas:
${preguntas}` }],
  });
  void registrarUsoIA("anthropic", res.usage.input_tokens, res.usage.output_tokens).catch(() => {});

  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { huecos?: string[] };

  for (const tema of json.huecos ?? []) {
    await crearAlertaKB(
      `Hueco de cobertura: ${tema}`,
      `Múltiples leads preguntaron sobre "${tema}" esta semana sin un recurso KB dedicado.`,
      "importante",
      { categoria_suciedad: "Huérfano de cobertura" }
    );
  }
}
