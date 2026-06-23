// S25.5 + S25.6 — Monitor de desempeño y sugerencias de ajuste de peso por vendedor
import { createServiceClient } from "@/lib/supabase/service";
import { calcularMetricasVendedor } from "@/services/vendedor-metricas";
import { callClaudeIA } from "@/lib/ai/client";

const UMBRAL_SHOW_RATE_BAJO = 0.4;
const UMBRAL_CONVERSION_ALTA = 0.5;
const MIN_CITAS_PARA_EVALUAR = 5;
const COOLDOWN_ALERTA_DIAS = 7;
const COOLDOWN_PESO_DIAS = 14;

async function alertaReciente(supabase: ReturnType<typeof createServiceClient>, vendedorId: string, tipoSugerencia: string, diasCooldown: number): Promise<boolean> {
  const desde = new Date(Date.now() - diasCooldown * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("sugerencias_ia")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "general")
    .contains("metadata", { tipo_sugerencia: tipoSugerencia, vendedor_id: vendedorId })
    .gte("created_at", desde);
  return (count ?? 0) > 0;
}

export async function ejecutarMonitorVendedores(): Promise<{ alertas: number; sugerencias: number }> {
  const supabase = createServiceClient();
  const { data: vendedores } = await supabase
    .from("vendedores").select("id, nombre, peso").eq("activo", true);

  let alertas = 0;
  let sugerencias = 0;

  for (const v of vendedores ?? []) {
    const m = await calcularMetricasVendedor(v.id).catch(() => null);
    if (!m) continue;

    // S25.5 — Detectar problemas y crear alerta en sugerencias_ia
    const problemas: string[] = [];
    if (m.totalCitas >= 3 && m.showRate < UMBRAL_SHOW_RATE_BAJO)
      problemas.push(`Show rate bajo: ${Math.round(m.showRate * 100)}%`);
    if (m.shows >= 3 && m.transcriptosSubidos < m.shows * 0.5)
      problemas.push(`Transcriptos insuficientes: ${m.transcriptosSubidos}/${m.shows}`);
    if (m.promesasVencidas >= 3)
      problemas.push(`${m.promesasVencidas} promesas vencidas sin cumplir`);

    if (problemas.length > 0 && !(await alertaReciente(supabase, v.id, "alerta_desempeno", COOLDOWN_ALERTA_DIAS))) {
      await supabase.from("sugerencias_ia").insert({
        tipo: "general",
        titulo: `Alerta de desempeño — ${v.nombre}`,
        descripcion: problemas.join(" · "),
        prioridad: "importante",
        metadata: { tipo_sugerencia: "alerta_desempeno", vendedor_id: v.id, vendedor_nombre: v.nombre },
      });
      alertas++;
    }

    // S25.6 — Sugerir ajuste de peso si hay suficientes datos
    if (m.totalCitas < MIN_CITAS_PARA_EVALUAR) continue;

    const pesoActual = v.peso ?? 50;
    const showRateBajo = m.showRate < UMBRAL_SHOW_RATE_BAJO && pesoActual > 20;
    const conversionAlta = m.tasaConversion > UMBRAL_CONVERSION_ALTA && pesoActual < 90;
    if (!showRateBajo && !conversionAlta) continue;

    const pesoSugerido = showRateBajo
      ? Math.max(0, pesoActual - 20)
      : Math.min(100, pesoActual + 20);

    if (await alertaReciente(supabase, v.id, "ajuste_peso", COOLDOWN_PESO_DIAS)) continue;

    const justificacion = await callClaudeIA("COACHING", {
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Eres el sistema de gestión de Centro ECM. Justifica brevemente (2-3 oraciones) por qué se sugiere cambiar el peso de asignación de citas del asesor ${v.nombre} de ${pesoActual} a ${pesoSugerido}. Show rate: ${Math.round(m.showRate * 100)}%, conversión: ${Math.round(m.tasaConversion * 100)}%, citas: ${m.totalCitas}. Solo la justificación, en español.`,
      }],
    }).then((r) => (r.content[0] as { text: string }).text.trim())
      .catch(() => `Se sugiere ajustar el peso de ${v.nombre} de ${pesoActual} a ${pesoSugerido} con base en su desempeño reciente.`);

    await supabase.from("sugerencias_ia").insert({
      tipo: "general",
      titulo: `Ajuste de peso sugerido — ${v.nombre}: ${pesoActual} → ${pesoSugerido}`,
      descripcion: justificacion,
      prioridad: "puede_esperar",
      metadata: { tipo_sugerencia: "ajuste_peso", vendedor_id: v.id, vendedor_nombre: v.nombre, peso_actual: pesoActual, peso_sugerido: pesoSugerido },
    });
    sugerencias++;
  }

  return { alertas, sugerencias };
}
