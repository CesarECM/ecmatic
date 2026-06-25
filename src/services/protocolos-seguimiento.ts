import { createServiceClient } from "@/lib/supabase/service";

export type Protocolo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  etapa_id: string | null;
  link_agendado: string | null;
  dias_duracion: number;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
};

export type Toque = {
  id: string;
  protocolo_id: string;
  orden: number;
  nombre: string;
  canal: "whatsapp" | "llamada" | "email";
  dia_offset: number;
  objetivo: string | null;
  guion_principal: string | null;
  guion_alternativo: string | null;
  nota_interna: string | null;
  ventana_hora_inicio: string | null;
  ventana_hora_fin: string | null;
  template_wa_id: string | null;
};

export type CriterioDescarte = {
  id: string;
  protocolo_id: string;
  orden: number;
  senal: string;
  diagnostico: string;
  accion: string;
  etiqueta_resultado: string | null;
};

export type EtiquetaDiagnostico = {
  id: string;
  protocolo_id: string;
  etiqueta: string;
  que_significa: string | null;
  que_indica: string | null;
};

export type ProtocoloCompleto = Protocolo & {
  toques: Toque[];
  criterios: CriterioDescarte[];
  etiquetas: EtiquetaDiagnostico[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function listarProtocolos(): Promise<(Protocolo & { total_leads: number })[]> {
  const { data, error } = await db()
    .from("protocolos_seguimiento")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[protocolos] ${error.message}`);

  const ids = (data ?? []).map((p: Protocolo) => p.id);
  if (!ids.length) return [];

  const { data: counts } = await db()
    .from("lead_protocolo")
    .select("protocolo_id")
    .in("protocolo_id", ids)
    .eq("estado", "activo");

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.protocolo_id] = (countMap[row.protocolo_id] ?? 0) + 1;
  }

  return (data ?? []).map((p: Protocolo) => ({ ...p, total_leads: countMap[p.id] ?? 0 }));
}

export async function obtenerProtocoloCompleto(id: string): Promise<ProtocoloCompleto | null> {
  const [{ data: proto, error }, { data: toques }, { data: criterios }, { data: etiquetas }] =
    await Promise.all([
      db().from("protocolos_seguimiento").select("*").eq("id", id).single(),
      db().from("protocolo_toques").select("*").eq("protocolo_id", id).order("orden"),
      db().from("protocolo_criterios_descarte").select("*").eq("protocolo_id", id).order("orden"),
      db().from("protocolo_etiquetas_diagnostico").select("*").eq("protocolo_id", id),
    ]);
  if (error || !proto) return null;
  return {
    ...(proto as Protocolo),
    toques: (toques ?? []) as Toque[],
    criterios: (criterios ?? []) as CriterioDescarte[],
    etiquetas: (etiquetas ?? []) as EtiquetaDiagnostico[],
  };
}

export async function obtenerProtocolosPorEtapa(etapaId: string): Promise<Protocolo[]> {
  const { data, error } = await db()
    .from("protocolos_seguimiento")
    .select("*")
    .eq("etapa_id", etapaId)
    .eq("activo", true);
  if (error) throw new Error(`[protocolos] ${error.message}`);
  return (data ?? []) as Protocolo[];
}

export async function copiarProtocolo(id: string, nuevaEtapaId: string): Promise<string> {
  const fuente = await obtenerProtocoloCompleto(id);
  if (!fuente) throw new Error(`[protocolos] Protocolo ${id} no encontrado`);

  const nuevoId = await crearProtocolo({
    nombre: `Copia de ${fuente.nombre}`,
    descripcion: fuente.descripcion,
    activo: false,
    etapa_id: nuevaEtapaId,
    link_agendado: fuente.link_agendado,
    dias_duracion: fuente.dias_duracion,
    notas_internas: fuente.notas_internas,
  });

  await Promise.all([
    ...fuente.toques.map((t) =>
      db().from("protocolo_toques").insert({ ...t, id: undefined, protocolo_id: nuevoId })
    ),
    ...fuente.criterios.map((c) =>
      db().from("protocolo_criterios_descarte").insert({ ...c, id: undefined, protocolo_id: nuevoId })
    ),
    ...fuente.etiquetas.map((e) =>
      db().from("protocolo_etiquetas_diagnostico").insert({ ...e, id: undefined, protocolo_id: nuevoId })
    ),
  ]);

  return nuevoId;
}

export async function crearProtocolo(
  data: Omit<Protocolo, "id" | "created_at" | "updated_at">
): Promise<string> {
  const { data: row, error } = await db()
    .from("protocolos_seguimiento")
    .insert(data)
    .select("id")
    .single();
  if (error) throw new Error(`[protocolos] ${error.message}`);
  return row.id;
}

export async function actualizarProtocolo(
  id: string,
  data: Partial<Omit<Protocolo, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const { error } = await db().from("protocolos_seguimiento").update(data).eq("id", id);
  if (error) throw new Error(`[protocolos] ${error.message}`);
}

export async function eliminarProtocolo(id: string): Promise<void> {
  const { error } = await db().from("protocolos_seguimiento").delete().eq("id", id);
  if (error) throw new Error(`[protocolos] ${error.message}`);
}

// ── TOQUES ─────────────────────────────────────────────────────────────────

export async function upsertToque(
  toque: Partial<Toque> & { protocolo_id: string; orden: number; nombre: string; canal: string }
): Promise<void> {
  const { error } = await db().from("protocolo_toques").upsert(toque);
  if (error) throw new Error(`[toques] ${error.message}`);
}

export async function eliminarToque(id: string): Promise<void> {
  const { error } = await db().from("protocolo_toques").delete().eq("id", id);
  if (error) throw new Error(`[toques] ${error.message}`);
}

export async function reordenarToques(toques: { id: string; orden: number }[]): Promise<void> {
  await Promise.all(
    toques.map(({ id, orden }) =>
      db().from("protocolo_toques").update({ orden }).eq("id", id)
    )
  );
}

// ── CRITERIOS ──────────────────────────────────────────────────────────────

export async function upsertCriterio(
  criterio: Partial<CriterioDescarte> & { protocolo_id: string; senal: string; diagnostico: string; accion: string }
): Promise<void> {
  const { error } = await db().from("protocolo_criterios_descarte").upsert(criterio);
  if (error) throw new Error(`[criterios] ${error.message}`);
}

export async function eliminarCriterio(id: string): Promise<void> {
  const { error } = await db().from("protocolo_criterios_descarte").delete().eq("id", id);
  if (error) throw new Error(`[criterios] ${error.message}`);
}

// ── ETIQUETAS ──────────────────────────────────────────────────────────────

export async function upsertEtiqueta(
  etiqueta: Partial<EtiquetaDiagnostico> & { protocolo_id: string; etiqueta: string }
): Promise<void> {
  const { error } = await db().from("protocolo_etiquetas_diagnostico").upsert(etiqueta);
  if (error) throw new Error(`[etiquetas] ${error.message}`);
}

export async function eliminarEtiqueta(id: string): Promise<void> {
  const { error } = await db().from("protocolo_etiquetas_diagnostico").delete().eq("id", id);
  if (error) throw new Error(`[etiquetas] ${error.message}`);
}
