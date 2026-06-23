import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

export interface FiltrosMomentos {
  leadId?: string;
  objecionTipo?: string;
  seCerro?: boolean;
}

// S5.9 — Registra un momento de cierre detectado en la conversación.
export async function registrarMomento(params: {
  leadId: string;
  mensajeId?: string;
  objecionTipo?: string;
  descripcion: string;
  seCerro?: boolean;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("momentos_cierre").insert({
    lead_id: params.leadId,
    mensaje_id: params.mensajeId ?? null,
    objecion_tipo: params.objecionTipo ?? null,
    descripcion: params.descripcion,
    se_cerro: params.seCerro ?? false,
  });
}

// S5.9 — Lista momentos de cierre con filtros opcionales.
export async function listarMomentos(filtros?: FiltrosMomentos) {
  const supabase = createServiceClient();
  let query = supabase
    .from("momentos_cierre")
    .select(`
      id, descripcion, objecion_tipo, se_cerro, created_at,
      leads (id, nombre, telefono, pipeline_stage)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filtros?.leadId) query = query.eq("lead_id", filtros.leadId);
  if (filtros?.objecionTipo) query = query.eq("objecion_tipo", filtros.objecionTipo);
  if (filtros?.seCerro !== undefined) query = query.eq("se_cerro", filtros.seCerro);

  const { data, error } = await query;
  if (error) throw new Error(`[momentos-cierre] Error: ${error.message}`);
  return data ?? [];
}

// S5.9 — Analiza con IA si hubo un momento de cierre perdido en el texto.
// Fire-and-forget desde conversacion.ts.
export async function detectarMomentoCierre(
  leadId: string,
  mensajeId: string,
  texto: string,
  intencion: string | null
): Promise<void> {
  if (!intencion || intencion === "otro") return;

  const prompt = `Eres analista de ventas de certificaciones CONOCER. Analiza este mensaje de un lead.
¿Hubo un momento donde se pudo haber cerrado la venta y no se cerró? ¿O se cerró exitosamente?

Intención clasificada: ${intencion}
Mensaje: "${texto}"

Responde en JSON:
{"detectado": true|false, "se_cerro": true|false, "objecion_tipo": "precio|tiempo|no_sirva|titulo|pensarlo|otro|null", "descripcion": "..."}
Si no hay momento relevante, responde {"detectado": false}`;

  try {
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      detectado?: boolean;
      se_cerro?: boolean;
      objecion_tipo?: string | null;
      descripcion?: string;
    };

    if (!json.detectado || !json.descripcion) return;

    await registrarMomento({
      leadId,
      mensajeId,
      objecionTipo: json.objecion_tipo ?? undefined,
      descripcion: json.descripcion,
      seCerro: json.se_cerro ?? false,
    });
  } catch {
    // silencioso
  }
}
