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

// Orquestador: ejecuta el ciclo completo de calidad KB (S15.6–S15.13)
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
  ];

  for (const [nombre, fn] of tareas) {
    try { await fn(); } catch (e) {
      errores.push(`${nombre}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { ok: errores.length === 0, errores };
}
