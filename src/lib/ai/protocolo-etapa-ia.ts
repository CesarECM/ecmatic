import { callClaudeIA } from "@/lib/ai/client";

interface SugerenciaProtocolo {
  reglaAvance: string;
  reglaRetroceso: string;
  reglaEspera: string;
  descripcion: string;
}

// S28.2 — Genera una sugerencia de protocolo de transición para una etapa
export async function sugerirProtocoloEtapa(params: {
  etapaNombre: string;
  ruta: string;
  fasesCagc: number[];
  muestrasMovimientos: { etapa_anterior: string; etapa_nueva: string; motivo?: string | null }[];
}): Promise<SugerenciaProtocolo | null> {
  const fasesTexto = params.fasesCagc.length
    ? `Fases CAGC asociadas: ${params.fasesCagc.join(", ")}`
    : "Sin fases CAGC asignadas";

  const muestrasTexto = params.muestrasMovimientos.length
    ? params.muestrasMovimientos
        .map((m) => `${m.etapa_anterior} → ${m.etapa_nueva}${m.motivo ? ` (${m.motivo})` : ""}`)
        .join("\n")
    : "Sin movimientos históricos disponibles";

  const prompt = `Eres experto en diseño de pipelines de ventas para certificaciones CONOCER en México.
Analiza la etapa "${params.etapaNombre}" del pipeline "${params.ruta}" y propón reglas de transición.

${fasesTexto}

Movimientos históricos de muestra:
${muestrasTexto}

Responde SOLO en JSON con este formato exacto:
{
  "regla_avance": "condición clara para mover al lead a la siguiente etapa",
  "regla_retroceso": "condición para regresar a la etapa anterior",
  "regla_espera": "condición para mantener al lead en esta etapa sin avanzar ni retroceder",
  "descripcion": "resumen breve del protocolo propuesto (1-2 oraciones)"
}`;

  try {
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(texto.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      regla_avance?: string;
      regla_retroceso?: string;
      regla_espera?: string;
      descripcion?: string;
    };

    if (!json.regla_avance) return null;

    return {
      reglaAvance: json.regla_avance,
      reglaRetroceso: json.regla_retroceso ?? "",
      reglaEspera: json.regla_espera ?? "",
      descripcion: json.descripcion ?? "",
    };
  } catch {
    return null;
  }
}
