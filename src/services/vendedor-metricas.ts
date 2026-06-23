import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

export interface MetricasVendedor {
  vendedorId: string;
  totalCitas: number;
  shows: number;
  noShows: number;
  showRate: number;
  conversiones: number;
  tasaConversion: number;
  promesasVencidas: number;
  transcriptosSubidos: number;
}

// S7.8 — Calcula métricas de desempeño de un vendedor en los últimos 30 días
export async function calcularMetricasVendedor(vendedorId: string): Promise<MetricasVendedor> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: citas } = await supabase
    .from("citas")
    .select("id, estado, resultado, lead_id")
    .eq("vendedor_id", vendedorId)
    .gte("fecha_inicio", desde);

  const { count: promesasVencidas } = await supabase
    .from("promesas_conversacion")
    .select("id", { count: "exact", head: true })
    .eq("actor", "vendedor")
    .eq("alerta_enviada", true)
    .is("cumplida", null);

  const citaIds = (citas ?? []).map((c) => c.id);
  const { count: transcriptosSubidos } = citaIds.length
    ? await supabase
        .from("transcriptos_meet")
        .select("id", { count: "exact", head: true })
        .gte("created_at", desde)
        .in("cita_id", citaIds)
    : { count: 0 };

  const total = citas?.length ?? 0;
  const shows = citas?.filter((c) => c.resultado === "show").length ?? 0;
  const noShows = citas?.filter((c) => c.resultado === "noshow").length ?? 0;

  const leadsIds = (citas ?? []).filter((c) => c.resultado === "show").map((c) => c.lead_id);
  const { count: conversiones } = leadsIds.length
    ? await supabase.from("leads").select("id", { count: "exact", head: true })
        .in("id", leadsIds).eq("pipeline_stage", "Comprado")
    : { count: 0 };

  return {
    vendedorId,
    totalCitas: total,
    shows, noShows,
    showRate: total > 0 ? shows / total : 0,
    conversiones: conversiones ?? 0,
    tasaConversion: shows > 0 ? (conversiones ?? 0) / shows : 0,
    promesasVencidas: promesasVencidas ?? 0,
    transcriptosSubidos: transcriptosSubidos ?? 0,
  };
}

// S7.9 — Genera sugerencias de coaching basadas en métricas y transcriptos
export async function generarCoachingIA(vendedorId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const metricas = await calcularMetricasVendedor(vendedorId);

  const { data: transcriptos } = await supabase
    .from("transcriptos_meet")
    .select("objeciones_detectadas, temperatura_cierre, analisis_completo")
    .in("cita_id",
      (await supabase.from("citas").select("id").eq("vendedor_id", vendedorId)).data?.map((c) => c.id) ?? []
    )
    .eq("procesado_por_ia", true)
    .order("created_at", { ascending: false })
    .limit(10);

  const prompt = `Eres coach de ventas de certificaciones CONOCER. Analiza el desempeño de este asesor y genera 3 sugerencias de mejora concretas.

Métricas últimos 30 días:
- Total citas: ${metricas.totalCitas}
- Show rate: ${Math.round(metricas.showRate * 100)}%
- Tasa de conversión: ${Math.round(metricas.tasaConversion * 100)}%
- Promesas vencidas: ${metricas.promesasVencidas}
- Transcriptos subidos: ${metricas.transcriptosSubidos}/${metricas.shows}

Patrones en transcriptos (objeciones recurrentes):
${(transcriptos ?? []).map((t) => JSON.stringify(t.objeciones_detectadas)).slice(0, 5).join("\n") || "Sin datos"}

Responde en JSON: ["sugerencia 1", "sugerencia 2", "sugerencia 3"]
Sé específico y accionable. En español.`;

  try {
    const res = await callClaudeIA("COACHING", {
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    return JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as string[];
  } catch { return []; }
}

// S7.10 — Detecta anomalías y genera alertas para el admin
export async function detectarAnomalias(): Promise<{ vendedorNombre: string; alerta: string }[]> {
  const supabase = createServiceClient();
  const { data: vendedores } = await supabase.from("vendedores").select("id, nombre").eq("activo", true);
  const alertas: { vendedorNombre: string; alerta: string }[] = [];

  for (const v of vendedores ?? []) {
    const m = await calcularMetricasVendedor(v.id);

    if (m.totalCitas >= 3 && m.showRate < 0.4) {
      alertas.push({ vendedorNombre: v.nombre, alerta: `Show rate bajo: ${Math.round(m.showRate * 100)}% (umbral 40%)` });
    }
    if (m.shows >= 3 && m.transcriptosSubidos < m.shows * 0.5) {
      alertas.push({ vendedorNombre: v.nombre, alerta: `Solo ${m.transcriptosSubidos} de ${m.shows} sesiones tienen transcripto` });
    }
    if (m.promesasVencidas >= 3) {
      alertas.push({ vendedorNombre: v.nombre, alerta: `${m.promesasVencidas} promesas vencidas sin cumplir` });
    }
  }
  return alertas;
}
