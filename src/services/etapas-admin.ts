import { createServiceClient } from "@/lib/supabase/service";

export interface TareaObligatoria {
  descripcion: string;
  completada_por: "vendedor" | "ia" | "lead";
}

export interface PlantillaMensaje {
  canal: "whatsapp" | "email" | "llamada" | "meet";
  asunto?: string;
  cuerpo: string;
  variables: string[];
}

export interface CondicionWorkflow {
  si: string;
  entonces: string;
}

export interface EtapaAdmin {
  id: string;
  nombre: string;
  orden: number;
  ruta: string;
  fases_cagc: number[];
  es_tronco: boolean;
  etapas_siguientes: string[];
  sla_dias: number | null;
  rotting_dias: number | null;
  criterios_entrada: string | null;
  criterios_salida: string | null;
  tareas_obligatorias: TareaObligatoria[];
  plantillas_mensaje: PlantillaMensaje[];
  condiciones_workflow: CondicionWorkflow[];
  activo: boolean;
  protocolo: {
    tipo: "ia-propuesto" | "manual";
    regla_avance: string | null;
    regla_retroceso: string | null;
    regla_espera: string | null;
  } | null;
  canales: string[];
}

export interface NuevaEtapaInput {
  nombre: string;
  fases_cagc?: number[];
  es_tronco?: boolean;
  sla_dias?: number;
  rotting_dias?: number;
  criterios_entrada?: string;
  criterios_salida?: string;
  tareas_obligatorias?: TareaObligatoria[];
  plantillas_mensaje?: PlantillaMensaje[];
  condiciones_workflow?: CondicionWorkflow[];
  etapas_siguientes?: string[];
}

export interface ActualizarEtapaInput {
  nombre?: string;
  fases_cagc?: number[];
  es_tronco?: boolean;
  etapas_siguientes?: string[];
  sla_dias?: number | null;
  rotting_dias?: number | null;
  criterios_entrada?: string | null;
  criterios_salida?: string | null;
  tareas_obligatorias?: TareaObligatoria[];
  plantillas_mensaje?: PlantillaMensaje[];
  condiciones_workflow?: CondicionWorkflow[];
  activo?: boolean;
  protocolo?: {
    tipo?: "ia-propuesto" | "manual";
    regla_avance?: string | null;
    regla_retroceso?: string | null;
    regla_espera?: string | null;
  };
  canales?: string[];
}

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServiceClient() as any;
}

export async function listarEtapasAdmin(ruta: string): Promise<EtapaAdmin[]> {
  const supabase = db();

  const [etapasRes, protocolosRes, canalesRes] = await Promise.all([
    supabase
      .from("pipeline_etapas")
      .select("id, nombre, orden, ruta, fases_cagc, es_tronco, etapas_siguientes, sla_dias, rotting_dias, criterios_entrada, criterios_salida, tareas_obligatorias, plantillas_mensaje, condiciones_workflow, activo")
      .eq("ruta", ruta)
      .order("orden"),
    supabase
      .from("etapa_protocolo")
      .select("etapa_id, tipo, regla_avance, regla_retroceso, regla_espera"),
    supabase
      .from("etapa_canales")
      .select("etapa_id, canal")
      .eq("activo", true),
  ]);

  if (etapasRes.error) throw new Error(`[etapas-admin] listarEtapas: ${etapasRes.error.message}`);

  const protMap = new Map<string, EtapaAdmin["protocolo"]>();
  (protocolosRes.data ?? []).forEach((p: { etapa_id: string; tipo: string; regla_avance: string | null; regla_retroceso: string | null; regla_espera: string | null }) =>
    protMap.set(p.etapa_id, {
      tipo:           p.tipo as "ia-propuesto" | "manual",
      regla_avance:   p.regla_avance,
      regla_retroceso: p.regla_retroceso,
      regla_espera:   p.regla_espera,
    })
  );

  const canMap = new Map<string, string[]>();
  (canalesRes.data ?? []).forEach((c: { etapa_id: string; canal: string }) => {
    const arr = canMap.get(c.etapa_id) ?? [];
    arr.push(c.canal);
    canMap.set(c.etapa_id, arr);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (etapasRes.data ?? []).map((e: any): EtapaAdmin => ({
    id:                   e.id,
    nombre:               e.nombre,
    orden:                e.orden,
    ruta:                 e.ruta,
    fases_cagc:           e.fases_cagc ?? [],
    es_tronco:            e.es_tronco ?? false,
    etapas_siguientes:    e.etapas_siguientes ?? [],
    sla_dias:             e.sla_dias ?? null,
    rotting_dias:         e.rotting_dias ?? null,
    criterios_entrada:    e.criterios_entrada ?? null,
    criterios_salida:     e.criterios_salida ?? null,
    tareas_obligatorias:  e.tareas_obligatorias ?? [],
    plantillas_mensaje:   e.plantillas_mensaje ?? [],
    condiciones_workflow: e.condiciones_workflow ?? [],
    activo:               e.activo,
    protocolo:            protMap.get(e.id) ?? null,
    canales:              canMap.get(e.id) ?? [],
  }));
}

export async function crearEtapa(ruta: string, input: NuevaEtapaInput): Promise<EtapaAdmin> {
  const supabase = db();

  const { data: maxOrden } = await supabase
    .from("pipeline_etapas")
    .select("orden")
    .eq("ruta", ruta)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orden = (maxOrden?.orden ?? 0) + 1;

  const { data: etapa, error } = await supabase
    .from("pipeline_etapas")
    .insert({
      nombre:               input.nombre,
      orden,
      ruta,
      fases_cagc:           input.fases_cagc ?? [],
      es_tronco:            input.es_tronco ?? false,
      etapas_siguientes:    input.etapas_siguientes ?? [],
      sla_dias:             input.sla_dias ?? null,
      rotting_dias:         input.rotting_dias ?? null,
      criterios_entrada:    input.criterios_entrada ?? null,
      criterios_salida:     input.criterios_salida ?? null,
      tareas_obligatorias:  input.tareas_obligatorias ?? [],
      plantillas_mensaje:   input.plantillas_mensaje ?? [],
      condiciones_workflow: input.condiciones_workflow ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`[etapas-admin] crearEtapa: ${error.message}`);

  // Canales por defecto: whatsapp + email
  await supabase.from("etapa_canales").insert([
    { etapa_id: etapa.id, canal: "whatsapp" },
    { etapa_id: etapa.id, canal: "email" },
  ]);

  // Protocolo vacío por defecto
  await supabase.from("etapa_protocolo").insert({ etapa_id: etapa.id, tipo: "ia-propuesto" });

  return listarEtapasAdmin(ruta).then((arr) => arr.find((e) => e.id === etapa.id)!);
}

export async function actualizarEtapa(
  etapaId: string,
  input: ActualizarEtapaInput
): Promise<void> {
  const supabase = db();
  const { protocolo, canales, ...camposPrincipales } = input;

  if (Object.keys(camposPrincipales).length) {
    const { error } = await supabase
      .from("pipeline_etapas")
      .update(camposPrincipales)
      .eq("id", etapaId);
    if (error) throw new Error(`[etapas-admin] actualizarEtapa: ${error.message}`);
  }

  if (protocolo) {
    await supabase
      .from("etapa_protocolo")
      .upsert({ etapa_id: etapaId, ...protocolo }, { onConflict: "etapa_id" });
  }

  if (canales) {
    await supabase.from("etapa_canales").delete().eq("etapa_id", etapaId);
    if (canales.length) {
      await supabase.from("etapa_canales").insert(
        canales.map((c) => ({ etapa_id: etapaId, canal: c }))
      );
    }
  }
}

export async function eliminarEtapa(etapaId: string): Promise<void> {
  const { error } = await db()
    .from("pipeline_etapas")
    .delete()
    .eq("id", etapaId);

  if (error) throw new Error(`[etapas-admin] eliminarEtapa: ${error.message}`);
}
