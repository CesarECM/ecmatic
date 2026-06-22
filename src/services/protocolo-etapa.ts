import { createServiceClient } from "@/lib/supabase/service";
import { sugerirProtocoloEtapa } from "@/lib/ai/protocolo-etapa-ia";

export interface ProtocoloEtapa {
  id: string;
  etapa_id: string;
  tipo: "ia-propuesto" | "manual";
  regla_avance: string | null;
  regla_retroceso: string | null;
  regla_espera: string | null;
  historial: HistorialEntry[];
  updated_at: string;
}

interface HistorialEntry extends Record<string, unknown> {
  regla_avance: string | null;
  regla_retroceso: string | null;
  regla_espera: string | null;
  tipo: string;
  autor: string;
  timestamp: string;
}

// S28.1 — Obtiene el protocolo de una etapa (null si no existe)
export async function obtenerProtocolo(etapaId: string): Promise<ProtocoloEtapa | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("etapa_protocolo")
    .select("*")
    .eq("etapa_id", etapaId)
    .maybeSingle();
  return data as ProtocoloEtapa | null;
}

// S28.1 — Guarda o actualiza un protocolo (manual), guardando versión anterior en historial
export async function guardarProtocoloManual(params: {
  etapaId: string;
  reglaAvance: string | null;
  reglaRetroceso: string | null;
  reglaEspera: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const existente = await obtenerProtocolo(params.etapaId);

  const entradaHistorial: HistorialEntry = {
    regla_avance: existente?.regla_avance ?? null,
    regla_retroceso: existente?.regla_retroceso ?? null,
    regla_espera: existente?.regla_espera ?? null,
    tipo: existente?.tipo ?? "manual",
    autor: "admin",
    timestamp: new Date().toISOString(),
  };

  const nuevoHistorial = existente
    ? [...(existente.historial ?? []), entradaHistorial]
    : [entradaHistorial];

  if (existente) {
    await supabase
      .from("etapa_protocolo")
      .update({
        tipo: "manual",
        regla_avance: params.reglaAvance,
        regla_retroceso: params.reglaRetroceso,
        regla_espera: params.reglaEspera,
        historial: nuevoHistorial,
      })
      .eq("etapa_id", params.etapaId)
      .throwOnError();
  } else {
    await supabase
      .from("etapa_protocolo")
      .insert({
        etapa_id: params.etapaId,
        tipo: "manual",
        regla_avance: params.reglaAvance,
        regla_retroceso: params.reglaRetroceso,
        regla_espera: params.reglaEspera,
        historial: nuevoHistorial,
      })
      .throwOnError();
  }
}

// S28.2 — Escanea etapas sin protocolo y genera sugerencias en cola de aprobación
export async function generarSugerenciasProtocolo(): Promise<void> {
  const supabase = createServiceClient();

  // Etapas activas sin protocolo aún
  const { data: etapas } = await supabase
    .from("pipeline_etapas")
    .select("id, nombre, ruta, fases_cagc")
    .eq("activo", true);

  if (!etapas?.length) return;

  const { data: protocolosExistentes } = await supabase
    .from("etapa_protocolo")
    .select("etapa_id");

  const conProtocolo = new Set((protocolosExistentes ?? []).map((p: { etapa_id: string }) => p.etapa_id));

  // Para análisis: obtener datos de conversión por etapa
  const { data: movimientos } = await supabase
    .from("pipeline_movimientos")
    .select("etapa_anterior, etapa_nueva, ruta, motivo")
    .limit(500);

  for (const etapa of etapas) {
    if (conProtocolo.has(etapa.id)) continue;

    // Comprobar si ya hay sugerencia pendiente para esta etapa
    const { data: pendiente } = await supabase
      .from("sugerencias_ia")
      .select("id")
      .eq("tipo", "pipeline")
      .ilike("titulo", `%Protocolo: ${etapa.nombre}%`)
      .eq("aprobado", false)
      .maybeSingle();

    if (pendiente) continue;

    const movimientosEtapa = (movimientos ?? []).filter(
      (m) =>
        (m.etapa_anterior === etapa.nombre || m.etapa_nueva === etapa.nombre) &&
        m.ruta === etapa.ruta
    );

    const sugerencia = await sugerirProtocoloEtapa({
      etapaNombre: etapa.nombre,
      ruta: etapa.ruta,
      fasesCagc: etapa.fases_cagc as number[],
      muestrasMovimientos: movimientosEtapa.slice(0, 30).map((m) => ({
        etapa_anterior: m.etapa_anterior ?? "",
        etapa_nueva: m.etapa_nueva,
        motivo: m.motivo,
      })),
    });

    if (!sugerencia) continue;

    await supabase.from("sugerencias_ia").insert({
      tipo: "pipeline",
      titulo: `Protocolo: ${etapa.nombre} (${etapa.ruta})`,
      descripcion: sugerencia.descripcion,
      prioridad: "puede_esperar",
      metadata: {
        etapa_id: etapa.id,
        regla_avance: sugerencia.reglaAvance,
        regla_retroceso: sugerencia.reglaRetroceso,
        regla_espera: sugerencia.reglaEspera,
        accion: "crear_protocolo",
      },
    });
  }
}
