// CRUD para relaciones enriquecidas entre servicios (reemplaza bundle_reglas).

import { createServiceClient } from "@/lib/supabase/service";

export type TipoRelacion =
  | "complementa"
  | "es_leadmagnet_de"
  | "prerequisito_de"
  | "version_avanzada_de"
  | "incluye_a"
  | "compite_con";

export const TIPO_RELACION_LABELS: Record<TipoRelacion, string> = {
  complementa:          "Complementa a",
  es_leadmagnet_de:     "Es leadmagnet de",
  prerequisito_de:      "Es prerequisito de",
  version_avanzada_de:  "Es versión avanzada de",
  incluye_a:            "Incluye a",
  compite_con:          "Compite con",
};

export const TIPOS_RELACION = Object.keys(TIPO_RELACION_LABELS) as TipoRelacion[];

export interface ServicioRelacion {
  id: string;
  servicio_origen_id: string;
  servicio_destino_id: string;
  tipo: TipoRelacion;
  descripcion: string | null;
  activa: boolean;
  creado_por: string;
  created_at: string;
  destino_titulo: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function listarRelaciones(servicioId: string): Promise<ServicioRelacion[]> {
  const { data, error } = await db()
    .from("servicio_relaciones")
    .select("*, destino:servicios!servicio_relaciones_servicio_destino_id_fkey(titulo)")
    .eq("servicio_origen_id", servicioId)
    .order("created_at");
  if (error) throw new Error(`[servicio-relaciones] listar: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    ...r,
    destino_titulo: r.destino?.titulo ?? "—",
    destino: undefined,
  })) as ServicioRelacion[];
}

export async function crearRelacion(params: {
  origenId: string;
  destinoId: string;
  tipo: TipoRelacion;
  descripcion?: string;
}): Promise<void> {
  if (params.origenId === params.destinoId) throw new Error("Un servicio no puede relacionarse consigo mismo");
  const { error } = await db()
    .from("servicio_relaciones")
    .upsert(
      {
        servicio_origen_id:  params.origenId,
        servicio_destino_id: params.destinoId,
        tipo:                params.tipo,
        descripcion:         params.descripcion ?? null,
        activa:              true,
      },
      { onConflict: "servicio_origen_id,servicio_destino_id,tipo" }
    );
  if (error) throw new Error(`[servicio-relaciones] crear: ${error.message}`);
}

export async function eliminarRelacion(relacionId: string): Promise<void> {
  const { error } = await db().from("servicio_relaciones").delete().eq("id", relacionId);
  if (error) throw new Error(`[servicio-relaciones] eliminar: ${error.message}`);
}

// Devuelve un bloque de texto para inyectar en el prompt del motor de respuesta.
// Solo incluye relaciones relevantes para el cierre (complementa, versión avanzada, leadmagnet).
export async function obtenerRelacionesParaPrompt(servicioId: string): Promise<string> {
  const relaciones = await listarRelaciones(servicioId).catch(() => []);
  const TIPOS_RELEVANTES: TipoRelacion[] = ["complementa", "version_avanzada_de", "es_leadmagnet_de"];
  const relevantes = relaciones.filter((r) => r.activa && TIPOS_RELEVANTES.includes(r.tipo));
  if (!relevantes.length) return "";
  const lineas = relevantes.map((r) => {
    const desc = r.descripcion ? ` — ${r.descripcion}` : "";
    return `• ${r.destino_titulo} (${TIPO_RELACION_LABELS[r.tipo]})${desc}`;
  });
  return [
    "\nSERVICIOS RELACIONADOS — preséntarlos proactivamente si el lead muestra apertura:",
    ...lineas,
    "No esperes a que el lead los pida. Si el servicio principal no convence del todo, menciona UNO de estos antes de concluir que no hay match.",
  ].join("\n");
}

export async function listarTodosLosDestinosPosibles(
  servicioId: string
): Promise<{ id: string; titulo: string }[]> {
  const { data } = await db()
    .from("servicios")
    .select("id, titulo")
    .eq("activo", true)
    .neq("id", servicioId)
    .order("titulo");
  return (data ?? []) as { id: string; titulo: string }[];
}
