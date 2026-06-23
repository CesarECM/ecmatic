// S20.7 — Analiza el rendimiento de secuencias de nurturing y propone ajustes continuos.
// Entrada: tabla de métricas por secuencia. Salida: ajustes sugeridos en JSON.

import { callClaudeIA } from "./client";

export interface MetricaSecuencia {
  id:                string;
  nombre:            string;
  canal:             string;
  etapa_pipeline:    string | null;
  fase_cagc_min:     number | null;
  fase_cagc_max:     number | null;
  dias_sin_respuesta: number;
  total_enviados:    number;
  respondidos:       number;
  tasa_respuesta:    number; // 0–1
}

export interface AjusteSugerido {
  secuencia_id:  string;
  secuencia_nombre: string;
  tipo_ajuste:   "canal" | "timing" | "cagc_rango" | "nueva_secuencia" | "pausar";
  descripcion:   string;
  prioridad:     "urgente" | "importante" | "puede_esperar";
}

const SYSTEM = `Eres un especialista en automatización de marketing para un CRM de certificaciones CONOCER.
Analizas el rendimiento de secuencias de nurturing y propones ajustes concretos y accionables.

TIPOS DE AJUSTE POSIBLES:
- canal: cambiar el canal de comunicación (WhatsApp ↔ email)
- timing: cambiar dias_sin_respuesta (cuándo enviar el mensaje)
- cagc_rango: restringir o ampliar el rango de fases CAGC que cubre la secuencia
- nueva_secuencia: crear una secuencia nueva para un hueco detectado
- pausar: desactivar una secuencia que tiene tasa_respuesta muy baja

CRITERIOS para marcar como "urgente": tasa_respuesta < 0.05 con > 10 envíos.
CRITERIOS para marcar como "importante": tasa_respuesta < 0.15 con > 5 envíos.

Responde ÚNICAMENTE con JSON válido:
{ "ajustes": [ { "secuencia_id", "secuencia_nombre", "tipo_ajuste", "descripcion", "prioridad" } ] }
Máximo 6 ajustes. Si todo está bien, devuelve { "ajustes": [] }.`;

export async function analizarRendimientoNurturing(
  metricas: MetricaSecuencia[]
): Promise<AjusteSugerido[]> {
  if (!metricas.length) return [];

  const tabla = metricas.map((m) =>
    `• [${m.id.slice(0, 8)}] "${m.nombre}" | canal:${m.canal} | etapa:${m.etapa_pipeline ?? "todas"} | ` +
    `CAGC:${m.fase_cagc_min ?? "?"}–${m.fase_cagc_max ?? "?"} | ` +
    `esperar:${m.dias_sin_respuesta}d | enviados:${m.total_enviados} | respuestas:${m.respondidos} | ` +
    `tasa:${(m.tasa_respuesta * 100).toFixed(1)}%`
  ).join("\n");

  const response = await callClaudeIA("ANALISIS", {
    max_tokens: 800,
    system:     SYSTEM,
    messages:   [{ role: "user", content: `MÉTRICAS DE SECUENCIAS:\n${tabla}` }],
  });

  try {
    const texto = (response.content[0] as { text: string }).text.trim();
    const parsed = JSON.parse(texto) as { ajustes: AjusteSugerido[] };
    return Array.isArray(parsed.ajustes) ? parsed.ajustes.slice(0, 6) : [];
  } catch {
    return [];
  }
}
