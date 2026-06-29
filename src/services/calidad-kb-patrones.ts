import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import {
  crearAlertaKB,
  detectarDuplicadosSemanticos,
  detectarObsolescenciaParcial,
  detectarHuecosCobertura,
} from "@/services/calidad-kb";

// S15.9 — Detecta templates cuya conversión está cayendo.
export async function detectarTemplatesDegradados(): Promise<void> {
  const supabase = createServiceClient();
  const { data: templates } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, score_efectividad, score_uso")
    .in("tipo", ["template_wa", "template_email"])
    .eq("activo", true).eq("aprobado", true)
    .lt("score_efectividad", 0.3)
    .gt("usos", 5);

  for (const t of templates ?? []) {
    await crearAlertaKB(
      `Template degradado: ${t.titulo}`,
      `Score de efectividad ${(t.score_efectividad * 100).toFixed(0)}% con ${t.score_uso} usos registrados.`,
      "importante",
      { recurso_id: t.id, categoria_suciedad: "Template degradado" }
    );
  }
}

// S15.10 — Detecta inconsistencia semántica entre WA y email sobre el mismo tema.
export async function detectarInconsistenciaCanales(): Promise<void> {
  const supabase = createServiceClient();
  const [{ data: wa }, { data: email }] = await Promise.all([
    supabase.from("recursos_conocimiento").select("id, titulo, contenido")
      .eq("tipo", "template_wa").eq("activo", true).eq("aprobado", true).limit(10),
    supabase.from("recursos_conocimiento").select("id, titulo, contenido")
      .eq("tipo", "template_email").eq("activo", true).eq("aprobado", true).limit(10),
  ]);
  if (!wa?.length || !email?.length) return;

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 200,
    messages: [{ role: "user", content: `Compara estos templates de WhatsApp y email para encontrar inconsistencias:
los que abordan el mismo tema pero con información distinta o contradictoria.
Lista máx 2 pares como JSON: {"pares": [{"wa_titulo": "X", "email_titulo": "Y", "problema": "descripción"}]}

Templates WA: ${wa.map((t) => `"${t.titulo}"`).join(", ")}
Templates Email: ${email.map((t) => `"${t.titulo}"`).join(", ")}` }],
  });
  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    pares?: { wa_titulo: string; email_titulo: string; problema: string }[]
  };
  for (const par of json.pares ?? []) {
    await crearAlertaKB(
      "Inconsistencia entre canales",
      `WA: "${par.wa_titulo}" vs Email: "${par.email_titulo}" — ${par.problema}`,
      "importante",
      { categoria_suciedad: "Inconsistencia de canal" }
    );
  }
}

// S15.11 — Detecta sesgo de origen único y deriva de tono.
export async function detectarSesgoYDerivaTono(): Promise<void> {
  const supabase = createServiceClient();
  const { data: antiguos } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, contenido, metadata")
    .eq("activo", true).eq("aprobado", true)
    .lt("updated_at", new Date(Date.now() - 180 * 86400000).toISOString())
    .limit(8);
  if (!antiguos?.length) return;

  const { data: recientes } = await supabase
    .from("recursos_conocimiento")
    .select("contenido")
    .eq("activo", true).eq("aprobado", true)
    .gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .limit(5);

  const tonoReciente = recientes?.map((r) => r.contenido.slice(0, 100)).join(" | ") ?? "";
  if (!tonoReciente) return;

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 200,
    messages: [{ role: "user", content: `Analiza estos recursos de KB antiguos (6+ meses). Identifica cuáles tienen un tono
distinto al de los recursos recientes de la marca. JSON: {"ids_deriva": ["uuid1"]}

Tono reciente de la marca: "${tonoReciente}"

Recursos antiguos:
${antiguos.map((r) => `[${r.id}] ${r.titulo}: ${r.contenido.slice(0, 150)}`).join("\n")}` }],
  });
  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { ids_deriva?: string[] };
  for (const id of json.ids_deriva ?? []) {
    const r = antiguos.find((x) => x.id === id);
    if (!r) continue;
    await crearAlertaKB(
      `Posible deriva de tono: ${r.titulo}`,
      "Este recurso de 6+ meses tiene un tono diferente al estilo de comunicación actual.",
      "puede_esperar",
      { recurso_id: id, categoria_suciedad: "Deriva de tono" }
    );
  }
}

// S15.12 — Detecta canibalización entre recursos.
export async function detectarCanibalización(): Promise<void> {
  const supabase = createServiceClient();
  const { data: pares } = await supabase.rpc("buscar_duplicados_kb", { umbral: 0.85 });
  if (!pares?.length) return;

  const ids = [...new Set((pares as { id_a: string; id_b: string }[]).flatMap((p) => [p.id_a, p.id_b]))];
  const { data: recursos } = await supabase
    .from("recursos_conocimiento")
    .select("id, titulo, score_efectividad, created_at")
    .in("id", ids);

  const mapaR = Object.fromEntries((recursos ?? []).map((r) => [r.id, r]));
  for (const par of (pares as { id_a: string; id_b: string; similitud: number }[]).slice(0, 3)) {
    const a = mapaR[par.id_a], b = mapaR[par.id_b];
    if (!a || !b) continue;
    const [mejor, peor] = a.score_efectividad >= b.score_efectividad ? [a, b] : [b, a];
    if (mejor.score_efectividad - peor.score_efectividad > 0.2) {
      await crearAlertaKB(
        `Canibalización: "${peor.titulo}"`,
        `"${mejor.titulo}" cubre el mismo tema con ${Math.round(mejor.score_efectividad * 100)}% vs ${Math.round(peor.score_efectividad * 100)}% de efectividad.`,
        "puede_esperar",
        { id_mejor: mejor.id, id_peor: peor.id, categoria_suciedad: "Canibalización" }
      );
    }
  }
}

// S15.13 — Propone una nueva categoría de suciedad no contemplada.
export async function sugerirCategoriaSuciedad(): Promise<void> {
  const supabase = createServiceClient();
  const { data: existentes } = await supabase
    .from("categorias_suciedad_kb").select("nombre");
  const { data: alertas } = await supabase
    .from("sugerencias_ia").select("titulo, descripcion")
    .eq("tipo", "kb_calidad").limit(20);

  if (!alertas?.length) return;

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 200,
    messages: [{ role: "user", content: `Analiza estas alertas de calidad de KB y determina si hay un patrón recurrente
que NO está en las categorías existentes. Si encuentras uno, proponlo.
JSON: {"nueva_categoria": {"nombre": "X", "descripcion": "Y", "regla": "Z"}} o {"nueva_categoria": null}

Categorías existentes: ${(existentes ?? []).map((e) => e.nombre).join(", ")}

Alertas recientes:
${alertas.map((a) => `- ${a.titulo}: ${a.descripcion}`).join("\n")}` }],
  });
  const raw = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    nueva_categoria?: { nombre: string; descripcion: string; regla: string } | null
  };
  const nc = json.nueva_categoria;
  if (!nc?.nombre) return;

  await supabase.from("categorias_suciedad_kb").insert({
    nombre: nc.nombre, descripcion: nc.descripcion,
    regla_deteccion: nc.regla, origen: "ia_sugerido", estado: "pendiente_revision",
  });
}

// MPS-9 S45.4 — Analiza patrones sistémicos en ediciones recientes de campaña GHL.
// Agrupa edits por recurso KB y detecta recursos con problemas recurrentes.
// Diseñado para correr diariamente con early-exit si no hay edits nuevas.
export async function analizarPatronesEdicion(desde?: Date): Promise<{ procesados: number }> {
  const supabase = createServiceClient();
  const ventanaDesde = (desde ?? new Date(Date.now() - 7 * 86400000)).toISOString();

  // Early-exit: si no hay edits procesadas en la ventana, no hay nada que analizar
  const { count: totalEdits } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("estado", "editado")
    .eq("feedback_procesado", true)
    .gte("revisado_at", ventanaDesde) as { count: number | null };

  if (!totalEdits || totalEdits < 2) return { procesados: 0 };

  // Leer edits con contexto y razón
  const { data: edits } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("id, mensaje_ia, mensaje_final, razon_edicion, contexto, campana")
    .eq("estado", "editado")
    .eq("feedback_procesado", true)
    .gte("revisado_at", ventanaDesde)
    .order("revisado_at", { ascending: false })
    .limit(50) as {
      data: {
        id: string; mensaje_ia: string; mensaje_final: string | null;
        razon_edicion: string | null; contexto: Record<string, unknown> | null; campana: string;
      }[] | null;
    };

  if (!edits?.length) return { procesados: 0 };

  // Agrupar por recurso KB: mapa recursoId → lista de razones de edición
  const mapa = new Map<string, string[]>();
  const sinRecurso: string[] = [];

  for (const edit of edits) {
    const ids = (edit.contexto?.recursosIds as string[] | undefined) ?? [];
    if (!ids.length) {
      if (edit.razon_edicion) sinRecurso.push(edit.razon_edicion);
      continue;
    }
    for (const rid of ids) {
      const prev = mapa.get(rid) ?? [];
      if (edit.razon_edicion) prev.push(edit.razon_edicion);
      mapa.set(rid, prev);
    }
  }

  // Recursos con 3+ edits → análisis profundo con Claude
  const recursosConProblemas = [...mapa.entries()].filter(([, razones]) => razones.length >= 2);

  if (!recursosConProblemas.length && !sinRecurso.length) return { procesados: edits.length };

  // Leer títulos de recursos problemáticos
  const idsProblematicos = recursosConProblemas.map(([id]) => id);
  const { data: recursos } = await (supabase as any)
    .from("recursos_conocimiento")
    .select("id, titulo")
    .in("id", idsProblematicos) as { data: { id: string; titulo: string }[] | null };

  const mapaRecursos = Object.fromEntries((recursos ?? []).map((r) => [r.id, r.titulo]));

  const resumenEdits = [
    ...recursosConProblemas.map(([id, razones]) =>
      `Recurso "${mapaRecursos[id] ?? id}" (${razones.length} edits): ${razones.slice(0, 3).join(" / ")}`
    ),
    ...(sinRecurso.length >= 2
      ? [`Sin recurso KB identificado (${sinRecurso.length} edits): ${sinRecurso.slice(0, 3).join(" / ")}`]
      : []),
  ].join("\n");

  const res = await callClaudeIA("ANALISIS", {
    max_tokens: 400,
    messages: [{ role: "user", content: `Eres auditor de KB de un CRM de certificaciones CONOCER México.
Analiza estos patrones de edición de respuestas de IA en la última semana.
Identifica máx 2 problemas sistémicos que requieren cambios en la KB.

Edits agrupadas por recurso:
${resumenEdits}

JSON: {"problemas": [{"titulo": "...", "descripcion": "...", "prioridad": "urgente|importante|puede_esperar", "que_cambiar": "..."}]}` }],
  });

  const raw  = (res.content[0] as { text: string }).text;
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    problemas?: { titulo: string; descripcion: string; prioridad: "urgente" | "importante" | "puede_esperar"; que_cambiar: string }[]
  };

  for (const p of json.problemas ?? []) {
    await crearAlertaKB(p.titulo, p.descripcion, p.prioridad, {
      source: "ghl_patron_semanal",
      recursos_analizados: idsProblematicos,
      que_cambiar: p.que_cambiar,
    });
  }

  return { procesados: edits.length };
}

// Orquestador: ejecuta el ciclo completo de calidad KB (S15.6–S15.13 + MPS-9)
export async function ejecutarCicloCalidadKB(): Promise<{ ok: boolean; errores: string[] }> {
  const errores: string[] = [];
  const tareas: [string, () => Promise<void>][] = [
    ["duplicados_semanticos",  detectarDuplicadosSemanticos],
    ["obsolescencia_parcial",  detectarObsolescenciaParcial],
    ["huecos_cobertura",       detectarHuecosCobertura],
    ["templates_degradados",   detectarTemplatesDegradados],
    ["inconsistencia_canales", detectarInconsistenciaCanales],
    ["sesgo_tono",             detectarSesgoYDerivaTono],
    ["canibalizacion",         detectarCanibalización],
    ["sugerir_categoria",      sugerirCategoriaSuciedad],
    ["patrones_edicion",       () => analizarPatronesEdicion().then(() => undefined)],
  ];

  for (const [nombre, fn] of tareas) {
    try { await fn(); } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { ok: errores.length === 0, errores };
}
