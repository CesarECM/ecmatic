// S20.6 — Motor de sugerencia de custom fields.
// Analiza conversaciones recientes de múltiples leads, detecta patrones de datos
// no capturados y los encola en sugerencias_ia para aprobación del admin.

import { createServiceClient } from "@/lib/supabase/service";
import { detectarCustomFieldsSugeridos, type CampoSugerido } from "@/lib/ai/custom-fields-ia";

const LEADS_A_MUESTREAR   = 15;   // leads distintos a incluir en el análisis
const MENSAJES_POR_LEAD   = 6;    // últimos mensajes entrantes de cada lead
const CATEGORIA_META       = "custom_field";

export interface ResultadoScanCustomFields {
  leadsAnalizados: number;
  camposDetectados: number;
  camposInsertados: number;
  camposDuplicados: number;
}

// ── Punto de entrada público ──────────────────────────────────────────────

export async function scanearCustomFields(): Promise<ResultadoScanCustomFields> {
  const supabase = createServiceClient();

  // 1. Obtener leads activos recientes con conversación real
  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("activo", true)
    .eq("archivado", false)
    .order("updated_at", { ascending: false })
    .limit(LEADS_A_MUESTREAR);

  if (!leads?.length) {
    return { leadsAnalizados: 0, camposDetectados: 0, camposInsertados: 0, camposDuplicados: 0 };
  }

  // 2. Recopilar muestras de conversación (solo mensajes entrantes)
  const muestras: string[] = [];
  for (const lead of leads) {
    const { data: msgs } = await (supabase as any)
      .from("mensajes")
      .select("contenido")
      .eq("lead_id", lead.id)
      .eq("direccion", "entrante")
      .order("created_at", { ascending: false })
      .limit(MENSAJES_POR_LEAD);

    if (msgs?.length) {
      const muestra = (msgs as { contenido: string }[])
        .reverse()
        .map((m) => m.contenido)
        .join(" | ");
      muestras.push(muestra);
    }
  }

  if (muestras.length < 3) {
    return { leadsAnalizados: muestras.length, camposDetectados: 0, camposInsertados: 0, camposDuplicados: 0 };
  }

  // 3. Detectar patrones con IA
  const camposSugeridos = await detectarCustomFieldsSugeridos(muestras);

  if (!camposSugeridos.length) {
    return { leadsAnalizados: muestras.length, camposDetectados: 0, camposInsertados: 0, camposDuplicados: 0 };
  }

  // 4. Filtrar duplicados contra sugerencias pendientes existentes
  const { data: pendientes } = await (supabase as any)
    .from("sugerencias_ia")
    .select("metadata")
    .eq("tipo", "general")
    .is("aprobado", null);

  const nombresPendientes = new Set(
    (pendientes ?? []).map((s: { metadata: Record<string, unknown> }) =>
      (s.metadata?.nombre_campo as string | undefined)?.toLowerCase() ?? ""
    )
  );

  const nuevos   = camposSugeridos.filter((c) => !nombresPendientes.has(c.nombre_campo.toLowerCase()));
  const duplicados = camposSugeridos.length - nuevos.length;

  // 5. Insertar sugerencias nuevas
  for (const campo of nuevos) {
    await (supabase as any).from("sugerencias_ia").insert({
      tipo:        "general",
      titulo:      `Custom Field: ${campo.nombre_campo}`,
      descripcion: `${campo.descripcion} · Tipo: ${campo.tipo_dato} · Ejemplos: ${campo.ejemplos.slice(0, 3).join(", ")}`,
      prioridad:   "puede_esperar",
      metadata:    {
        categoria:    CATEGORIA_META,
        nombre_campo: campo.nombre_campo,
        tipo_dato:    campo.tipo_dato,
        ejemplos:     campo.ejemplos,
      } satisfies Record<string, unknown>,
    });
  }

  return {
    leadsAnalizados:  muestras.length,
    camposDetectados: camposSugeridos.length,
    camposInsertados: nuevos.length,
    camposDuplicados: duplicados,
  };
}
