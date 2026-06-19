import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import { registrarUsoIA } from "@/services/alertas-ia";
import type { FaseCAGC } from "@/services/cagc";

interface ResultadoCAGC {
  fase: number;
  confianza: number;
  motivo: string;
}

// Construye la referencia compacta de fases para el system prompt
function buildFaseRef(fases: FaseCAGC[]): string {
  return fases
    .map((f) => {
      const senales = (f.senales_deteccion ?? []).join(" | ");
      return `${f.numero} — ${f.nombre} (${f.nombre_tecnico}): ${senales}`;
    })
    .join("\n");
}

// S13.2 — Infiere la fase CAGC desde la conversación activa.
// No escribe a BD — solo devuelve el resultado. El llamador decide si persiste.
export async function inferirFaseCAGC(
  mensajes: string[],
  historial: string,
  fases: FaseCAGC[],
  faseActual?: number
): Promise<ResultadoCAGC> {
  const faseRef = buildFaseRef(fases);
  const textoActual = mensajes.join("\n");
  const contextoFase =
    faseActual !== undefined
      ? `Fase actual registrada: ${faseActual} — ${fases.find((f) => f.numero === faseActual)?.nombre ?? "Desconocida"}`
      : "Sin fase previa registrada";

  const system = `Eres un clasificador de fase del comprador para Centro ECM (certificaciones CONOCER, México).
Analiza la conversación y determina en qué fase del framework CAGC está el lead.

FASES DEL COMPRADOR:
${faseRef}

REGLAS:
- Evalúa el ARCO COMPLETO de la conversación, no solo el último mensaje
- La fase no retrocede salvo por señales muy claras (ej. un lead que pagó y siente disonancia puede estar en fase 11)
- Si hay ambigüedad, elige la fase más baja (conservadora): es mejor subestimar que sobreestimar
- La confianza refleja qué tan claras son las señales: 0.9+ = señales inequívocas, 0.5-0.7 = señales parciales, <0.5 = inferencia especulativa
- El motivo debe ser específico a lo que dijo el lead, en español, máx 15 palabras

Responde ÚNICAMENTE con JSON válido sin explicaciones:
{"fase": N, "confianza": 0.XX, "motivo": "razón específica del lead"}`;

  const userContent = `${contextoFase}

Historial previo:
${historial || "(primera interacción)"}

Mensaje(s) nuevo(s):
${textoActual}

¿En qué fase CAGC está este lead?`;

  try {
    const res = await anthropic.messages.create({
      model: modeloPorTarea("CAGC_INFERIR"),
      max_tokens: 80,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    void registrarUsoIA(
      "anthropic",
      res.usage.input_tokens,
      res.usage.output_tokens
    ).catch(() => {});

    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(
      raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"
    ) as Partial<ResultadoCAGC>;

    const fase = typeof json.fase === "number" ? Math.max(0, Math.min(16, json.fase)) : faseActual ?? 0;
    const confianza = typeof json.confianza === "number" ? Math.max(0, Math.min(1, json.confianza)) : 0.5;

    return {
      fase,
      confianza,
      motivo: json.motivo ?? "sin motivo registrado",
    };
  } catch {
    return {
      fase: faseActual ?? 0,
      confianza: 0,
      motivo: "error en inferencia — fase sin cambio",
    };
  }
}
