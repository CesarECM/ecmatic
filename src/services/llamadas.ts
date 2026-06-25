import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "./log-sistema";
import { avanzarToque, registrarResultadoToque } from "./lead-protocolo";

export type ObjetivoLlamada  = "cierre" | "avance";
export type ResultadoLlamada = "exitoso" | "no-contesta" | "seguimiento" | "perdido";
export type EstadoLlamada    = "pendiente" | "completada";

export interface Llamada {
  id: string;
  lead_id: string;
  vendedor_id: string;
  objetivo: ObjetivoLlamada;
  resultado: ResultadoLlamada | null;
  estado: EstadoLlamada;
  notas: string | null;
  duracion_min: number | null;
  toque_id: string | null;
  lead_protocolo_id: string | null;
  toque_registro_id: string | null;
  protocolo_id: string | null;
  toque_orden: number | null;
  created_at: string;
  leads?: { nombre: string | null; telefono: string | null };
}

export interface LlamadaPendienteProtocolo extends Llamada {
  protocolo_toques: {
    nombre: string;
    objetivo: string | null;
    guion_principal: string | null;
    guion_alternativo: string | null;
    nota_interna: string | null;
  } | null;
  protocolos_seguimiento: { nombre: string } | null;
}

export interface MetricasLlamadasVendedor {
  total: number;
  exitosas: number;
  noContesta: number;
  tasaExito: number;
  duracionPromedioMin: number;
}

// S28.4 — Registra una llamada manual del vendedor (sin protocolo)
export async function registrarLlamada(params: {
  leadId: string;
  vendedorId: string;
  objetivo: ObjetivoLlamada;
  resultado: ResultadoLlamada;
  notas?: string;
  duracionMin?: number;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("llamadas_vendedor")
    .insert({
      lead_id:     params.leadId,
      vendedor_id: params.vendedorId,
      objetivo:    params.objetivo,
      resultado:   params.resultado,
      estado:      "completada",
      notas:       params.notas ?? null,
      duracion_min: params.duracionMin ?? null,
    })
    .throwOnError();

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.registrar-manual", fase: "ok",
    leadId: params.leadId,
    resultado: `Llamada manual registrada — objetivo: ${params.objetivo}, resultado: ${params.resultado}`,
    metadata: { vendedor_id: params.vendedorId, duracion_min: params.duracionMin ?? null },
  });
}

// S28.4 — Crea una llamada pendiente vinculada a un toque de protocolo.
// El protocolo NO avanza hasta que el vendedor complete esta llamada.
export async function crearLlamadaPendienteProtocolo(params: {
  leadId: string;
  vendedorId: string;
  toqueId: string;
  leadProtocoloId: string;
  toqueRegistroId: string | null;
  protocoloId: string;
  toqueOrden: number;
  objetivo: ObjetivoLlamada;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .insert({
      lead_id:          params.leadId,
      vendedor_id:      params.vendedorId,
      objetivo:         params.objetivo,
      resultado:        null,
      estado:           "pendiente",
      toque_id:         params.toqueId,
      lead_protocolo_id: params.leadProtocoloId,
      toque_registro_id: params.toqueRegistroId,
      protocolo_id:     params.protocoloId,
      toque_orden:      params.toqueOrden,
    })
    .select("id")
    .single();

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.crear-pendiente", fase: "error",
      leadId: params.leadId, resultado: error.message,
      metadata: { toque_id: params.toqueId, lead_protocolo_id: params.leadProtocoloId },
    });
    throw new Error(`[llamadas] crearLlamadaPendienteProtocolo: ${error.message}`);
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.crear-pendiente", fase: "ok",
    leadId: params.leadId,
    resultado: `Llamada pendiente creada — id: ${data.id}, toque #${params.toqueOrden}`,
    metadata: { llamada_id: data.id, toque_id: params.toqueId, protocolo_id: params.protocoloId },
  });

  return data.id;
}

// S28.4 — Devuelve true si ya existe una llamada pendiente para este toque del protocolo.
// Evita que el cron cree llamadas duplicadas en cada ejecución.
export async function tieneLlamadaPendienteParaToque(
  leadProtocoloId: string,
  toqueId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("llamadas_vendedor")
    .select("id", { count: "exact", head: true })
    .eq("lead_protocolo_id", leadProtocoloId)
    .eq("toque_id", toqueId)
    .eq("estado", "pendiente");

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.check-duplicado", fase: "debug",
    resultado: `Llamadas pendientes existentes para lead_protocolo ${leadProtocoloId}, toque ${toqueId}: ${count ?? 0}`,
    metadata: { lead_protocolo_id: leadProtocoloId, toque_id: toqueId },
  });

  return (count ?? 0) > 0;
}

// S28.4 — Lista las llamadas pendientes de protocolo para un vendedor.
// Es la fuente de datos para el panel "/vendedor/llamadas".
export async function listarLlamadasPendientesVendedor(
  vendedorId: string
): Promise<LlamadaPendienteProtocolo[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .select(`
      *,
      leads(nombre, telefono),
      protocolo_toques!toque_id(nombre, objetivo, guion_principal, guion_alternativo, nota_interna),
      protocolos_seguimiento!protocolo_id(nombre)
    `)
    .eq("vendedor_id", vendedorId)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) {
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.listar-pendientes", fase: "error",
      resultado: error.message, metadata: { vendedor_id: vendedorId },
    });
    throw new Error(`[llamadas] listarLlamadasPendientesVendedor: ${error.message}`);
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.listar-pendientes", fase: "ok",
    resultado: `${(data ?? []).length} llamada(s) pendiente(s)`,
    metadata: { vendedor_id: vendedorId },
  });

  return (data ?? []) as LlamadaPendienteProtocolo[];
}

// S28.4 — Completa una llamada de protocolo y avanza el toque correspondiente.
// Este es el único punto donde el protocolo avanza para toques de tipo "llamada".
export async function completarLlamadaProtocolo(params: {
  llamadaId: string;
  resultado: ResultadoLlamada;
  notas?: string;
  duracionMin?: number;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: llamada, error: fetchError } = await supabase
    .from("llamadas_vendedor")
    .select("*")
    .eq("id", params.llamadaId)
    .eq("estado", "pendiente")
    .single();

  if (fetchError || !llamada) {
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.completar-protocolo", fase: "error",
      resultado: fetchError?.message ?? "Llamada no encontrada o ya completada",
      metadata: { llamada_id: params.llamadaId },
    });
    throw new Error("[llamadas] completarLlamadaProtocolo: llamada no encontrada o ya completada");
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.completar-protocolo", fase: "inicio",
    leadId: llamada.lead_id,
    resultado: `Completando llamada ${params.llamadaId} — resultado: ${params.resultado}`,
    metadata: {
      llamada_id: params.llamadaId,
      lead_protocolo_id: llamada.lead_protocolo_id,
      toque_orden: llamada.toque_orden,
    },
  });

  // Marca la llamada como completada
  await supabase
    .from("llamadas_vendedor")
    .update({
      estado:      "completada",
      resultado:   params.resultado,
      notas:       params.notas ?? null,
      duracion_min: params.duracionMin ?? null,
    })
    .eq("id", params.llamadaId)
    .throwOnError();

  // Actualiza el registro de toque con el resultado real
  if (llamada.toque_registro_id) {
    await registrarResultadoToque(llamada.toque_registro_id, params.resultado, params.notas);
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.completar-protocolo", fase: "debug",
      leadId: llamada.lead_id,
      resultado: `Toque registro actualizado — id: ${llamada.toque_registro_id}`,
    });
  }

  // Avanza el protocolo al siguiente toque
  if (llamada.lead_protocolo_id && llamada.protocolo_id && llamada.toque_orden !== null) {
    await avanzarToque(llamada.lead_protocolo_id, llamada.protocolo_id, llamada.toque_orden);
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.completar-protocolo", fase: "ok",
      leadId: llamada.lead_id,
      resultado: `Protocolo avanzado — toque ${llamada.toque_orden} → ${llamada.toque_orden + 1}`,
      metadata: { lead_protocolo_id: llamada.lead_protocolo_id },
    });
  } else {
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.completar-protocolo", fase: "warn",
      leadId: llamada.lead_id,
      resultado: "Llamada completada sin datos de protocolo — toque no avanzado",
      metadata: {
        lead_protocolo_id: llamada.lead_protocolo_id,
        protocolo_id: llamada.protocolo_id,
      },
    });
  }
}

// S28.4 — Lista llamadas completadas de un vendedor (historial)
export async function listarLlamadasVendedor(
  vendedorId: string,
  limite = 50
): Promise<Llamada[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .select("*, leads(nombre, telefono)")
    .eq("vendedor_id", vendedorId)
    .eq("estado", "completada")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`[llamadas] ${error.message}`);
  return (data ?? []) as Llamada[];
}

// S28.4 — Lista todas las llamadas completadas (vista admin)
export async function listarTodasLlamadas(limite = 100): Promise<Llamada[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("llamadas_vendedor")
    .select("*, leads(nombre, telefono)")
    .eq("estado", "completada")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`[llamadas] ${error.message}`);
  return (data ?? []) as Llamada[];
}

// Admin — Crea una llamada pendiente manual para el vendedor asignado al lead.
// No está vinculada a ningún protocolo; el protocolo no avanza al completarla.
export async function agendarLlamadaAdmin(params: {
  leadId: string;
  objetivo: ObjetivoLlamada;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("vendedor_id, nombre, telefono")
    .eq("id", params.leadId)
    .single();

  if (!lead?.vendedor_id) {
    void logSistema({
      categoria: "servicio", tipoAccion: "llamadas.agendar-admin", fase: "warn",
      leadId: params.leadId,
      resultado: "Lead sin vendedor asignado — llamada no creada",
    });
    throw new Error("Este lead no tiene un vendedor asignado. Asigna un vendedor primero.");
  }

  await supabase
    .from("llamadas_vendedor")
    .insert({
      lead_id:     params.leadId,
      vendedor_id: lead.vendedor_id,
      objetivo:    params.objetivo,
      resultado:   null,
      estado:      "pendiente",
    })
    .throwOnError();

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.agendar-admin", fase: "ok",
    leadId: params.leadId,
    resultado: `Llamada manual agendada — objetivo: ${params.objetivo}, vendedor: ${lead.vendedor_id}`,
    metadata: { lead_nombre: lead.nombre, lead_telefono: lead.telefono },
  });
}

// S28.4 — Métricas de eficiencia del vendedor (solo llamadas completadas)
export async function metricasLlamadasVendedor(
  vendedorId: string
): Promise<MetricasLlamadasVendedor> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("llamadas_vendedor")
    .select("resultado, duracion_min")
    .eq("vendedor_id", vendedorId)
    .eq("estado", "completada");

  const llamadas    = data ?? [];
  const total       = llamadas.length;
  const exitosas    = llamadas.filter((l) => l.resultado === "exitoso").length;
  const noContesta  = llamadas.filter((l) => l.resultado === "no-contesta").length;
  const conDuracion = llamadas.filter((l) => l.duracion_min != null);
  const duracionTotal = conDuracion.reduce((acc, l) => acc + (l.duracion_min ?? 0), 0);

  void logSistema({
    categoria: "servicio", tipoAccion: "llamadas.metricas", fase: "ok",
    resultado: `total: ${total}, exitosas: ${exitosas}, tasa: ${total > 0 ? Math.round((exitosas / total) * 100) : 0}%`,
    metadata: { vendedor_id: vendedorId },
  });

  return {
    total,
    exitosas,
    noContesta,
    tasaExito:          total > 0 ? Math.round((exitosas / total) * 100) : 0,
    duracionPromedioMin: conDuracion.length > 0 ? Math.round(duracionTotal / conDuracion.length) : 0,
  };
}
