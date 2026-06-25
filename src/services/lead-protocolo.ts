import { createServiceClient } from "@/lib/supabase/service";
import { obtenerProtocolosPorEtapa, obtenerProtocoloCompleto } from "./protocolos-seguimiento";
import { logSistema } from "./log-sistema";
import type { Toque } from "./protocolos-seguimiento";

export type LeadProtocolo = {
  id: string;
  lead_id: string;
  protocolo_id: string;
  toque_actual: number;
  proximo_toque_at: string | null;
  estado: "activo" | "completado" | "descartado" | "pausado";
  etiqueta_aplicada: string | null;
  created_at: string;
  updated_at: string;
};

export type ToqueRegistro = {
  id: string;
  lead_id: string;
  protocolo_id: string;
  toque_id: string;
  programado_at: string;
  ejecutado_at: string | null;
  resultado: string;
  notas: string | null;
  mensaje_cola_id: string | null;
  created_at: string;
  protocolo_toques?: { nombre: string; canal: string; orden: number } | null;
  protocolos_seguimiento?: { nombre: string } | null;
};

export type ToquePendiente = {
  leadProtocolo: LeadProtocolo;
  lead: { id: string; nombre: string | null; telefono: string | null; vendedor_id: string | null };
  toque: Toque;
  protocolo: { id: string; nombre: string; link_agendado: string | null };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// Enrola un lead en todos los protocolos activos asignados a esa etapa
export async function enrollarLeadEnProtocolosPorEtapa(
  leadId: string,
  etapaId: string
): Promise<number> {
  const protocolos = await obtenerProtocolosPorEtapa(etapaId);
  if (!protocolos.length) return 0;

  void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-etapa", fase: "inicio", leadId, resultado: `${protocolos.length} protocolo(s) para etapa ${etapaId}` });

  let enrollados = 0;
  for (const proto of protocolos) {
    const { error } = await db().from("lead_protocolo").upsert(
      {
        lead_id: leadId,
        protocolo_id: proto.id,
        toque_actual: 1,
        proximo_toque_at: new Date().toISOString(),
        estado: "activo",
      },
      { onConflict: "lead_id,protocolo_id", ignoreDuplicates: false }
    );
    if (!error) {
      enrollados++;
      void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-etapa", fase: "ok", leadId, resultado: `Enrollado en "${proto.nombre}"`, metadata: { protocolo_id: proto.id } });
    } else {
      void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-etapa", fase: "error", leadId, resultado: error.message, metadata: { protocolo_id: proto.id } });
    }
  }
  return enrollados;
}

// Obtiene todos los toques pendientes de ejecutar (para el CRON)
export async function obtenerToquesPendientes(): Promise<ToquePendiente[]> {
  const { data, error } = await db()
    .from("lead_protocolo")
    .select(`
      *,
      leads!lead_id(id, nombre, telefono, vendedor_id),
      protocolos_seguimiento!protocolo_id(id, nombre, link_agendado)
    `)
    .eq("estado", "activo")
    .lte("proximo_toque_at", new Date().toISOString());

  if (error) throw new Error(`[lead-protocolo] ${error.message}`);
  if (!data?.length) return [];

  const result: ToquePendiente[] = [];
  for (const lp of data) {
    const proto = await obtenerProtocoloCompleto(lp.protocolo_id);
    if (!proto) continue;
    const toque = proto.toques.find((t: Toque) => t.orden === lp.toque_actual);
    if (!toque) {
      await db().from("lead_protocolo").update({ estado: "completado" }).eq("id", lp.id);
      void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.auto-completar", fase: "ok", leadId: lp.leads?.id, resultado: `Protocolo ${lp.protocolo_id} completado — toque ${lp.toque_actual} sin sucesor`, metadata: { lead_protocolo_id: lp.id } });
      continue;
    }
    result.push({
      leadProtocolo: lp as LeadProtocolo,
      lead: lp.leads,
      toque,
      protocolo: lp.protocolos_seguimiento,
    });
  }
  return result;
}

// Avanza al siguiente toque después de ejecutar el actual
export async function avanzarToque(
  leadProtocoloId: string,
  protocoloId: string,
  toqueActualOrden: number
): Promise<void> {
  const proto = await obtenerProtocoloCompleto(protocoloId);
  if (!proto) {
    void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.avanzar-toque", fase: "warn", resultado: `Protocolo ${protocoloId} no encontrado — toque no avanzado`, metadata: { lead_protocolo_id: leadProtocoloId } });
    return;
  }

  const siguiente = proto.toques.find((t: Toque) => t.orden === toqueActualOrden + 1);

  if (!siguiente) {
    await db()
      .from("lead_protocolo")
      .update({ estado: "completado", toque_actual: toqueActualOrden + 1 })
      .eq("id", leadProtocoloId);
    void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.avanzar-toque", fase: "ok", resultado: `Protocolo completado — último toque era #${toqueActualOrden}`, metadata: { lead_protocolo_id: leadProtocoloId } });
    return;
  }

  const { data: lp } = await db()
    .from("lead_protocolo")
    .select("created_at")
    .eq("id", leadProtocoloId)
    .single();
  if (!lp) {
    void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.avanzar-toque", fase: "warn", resultado: `LeadProtocolo ${leadProtocoloId} no encontrado tras buscar created_at`, metadata: { lead_protocolo_id: leadProtocoloId } });
    return;
  }

  const inicio = new Date(lp.created_at);
  const proximo = new Date(inicio.getTime() + siguiente.dia_offset * 24 * 60 * 60 * 1000);

  await db().from("lead_protocolo").update({
    toque_actual: siguiente.orden,
    proximo_toque_at: proximo.toISOString(),
  }).eq("id", leadProtocoloId);
  void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.avanzar-toque", fase: "ok", resultado: `Toque #${toqueActualOrden} → #${siguiente.orden} | próximo: ${proximo.toISOString()}`, metadata: { lead_protocolo_id: leadProtocoloId, proximo_toque_at: proximo.toISOString() } });
}

export async function descartarLeadProtocolo(leadProtocoloId: string, etiqueta: string): Promise<void> {
  await db()
    .from("lead_protocolo")
    .update({ estado: "descartado", etiqueta_aplicada: etiqueta })
    .eq("id", leadProtocoloId);
  void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.descartar", fase: "ok", resultado: `LeadProtocolo ${leadProtocoloId} descartado con etiqueta: "${etiqueta}"`, metadata: { lead_protocolo_id: leadProtocoloId, etiqueta } });
}

export async function cambiarEstadoProtocolo(
  leadProtocoloId: string,
  estado: "activo" | "pausado"
): Promise<void> {
  await db().from("lead_protocolo").update({ estado }).eq("id", leadProtocoloId);
  void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.cambiar-estado", fase: "ok", resultado: `LeadProtocolo ${leadProtocoloId} → ${estado}`, metadata: { lead_protocolo_id: leadProtocoloId, estado } });
}

export async function registrarResultadoToque(
  toqueRegistroId: string,
  resultado: string,
  notas?: string
): Promise<void> {
  await db()
    .from("lead_toque_registro")
    .update({ resultado, notas: notas ?? null, ejecutado_at: new Date().toISOString() })
    .eq("id", toqueRegistroId);
  void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.registrar-resultado-toque", fase: "ok", resultado: `Toque ${toqueRegistroId} → ${resultado}${notas ? ` | notas: "${notas}"` : ""}`, metadata: { toque_registro_id: toqueRegistroId } });
}

// Enrola un lead en todos los protocolos activos (sin filtrar por etapa)
export async function enrollarLeadEnProtocolosActivos(leadId: string): Promise<number> {
  const { data, error } = await db()
    .from("protocolos_seguimiento")
    .select("id, nombre")
    .eq("activo", true);

  if (error) {
    void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-activos", fase: "error", leadId, resultado: error.message });
    throw new Error(`[lead-protocolo] ${error.message}`);
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "lead-protocolo.enroll-activos", fase: "inicio", leadId,
    resultado: `${data?.length ?? 0} protocolo(s) activo(s) encontrado(s)`,
    metadata: { protocolos: (data ?? []).map((p: { id: string; nombre: string }) => ({ id: p.id, nombre: p.nombre })) },
  });

  if (!data?.length) return 0;

  let enrollados = 0;
  for (const proto of data as { id: string; nombre: string }[]) {
    const { error: upsertError } = await db().from("lead_protocolo").upsert(
      {
        lead_id: leadId,
        protocolo_id: proto.id,
        toque_actual: 1,
        proximo_toque_at: new Date().toISOString(),
        estado: "activo",
      },
      { onConflict: "lead_id,protocolo_id", ignoreDuplicates: false }
    );
    if (!upsertError) {
      enrollados++;
      void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-activos", fase: "ok", leadId, resultado: `Enrollado en "${proto.nombre}"`, metadata: { protocolo_id: proto.id } });
    } else {
      void logSistema({ categoria: "servicio", tipoAccion: "lead-protocolo.enroll-activos", fase: "error", leadId, resultado: upsertError.message, metadata: { protocolo_id: proto.id } });
    }
  }
  return enrollados;
}

export async function obtenerHistorialToques(leadId: string): Promise<ToqueRegistro[]> {
  const { data } = await db()
    .from("lead_toque_registro")
    .select(`
      *,
      protocolo_toques!toque_id(nombre, canal, orden),
      protocolos_seguimiento!protocolo_id(nombre)
    `)
    .eq("lead_id", leadId)
    .order("programado_at", { ascending: true });
  return (data ?? []) as ToqueRegistro[];
}

export async function obtenerProtocoloActivoLead(
  leadId: string
): Promise<(LeadProtocolo & { protocolo_nombre: string }) | null> {
  const { data } = await db()
    .from("lead_protocolo")
    .select("*, protocolos_seguimiento!protocolo_id(nombre)")
    .eq("lead_id", leadId)
    .in("estado", ["activo", "pausado"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { ...(data as LeadProtocolo), protocolo_nombre: data.protocolos_seguimiento?.nombre ?? "" };
}
