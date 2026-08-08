// GET /api/admin/workspace/aprobaciones
// Sirve los datos de la cola de aprobaciones para AprobacionesPane.
// fetchAprobacionesData() también es importado por workspace/page.tsx (SSR inicial).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listarPendientes } from "@/services/etiquetas";
import { listarMensajesPendientes } from "@/services/mensajes-aprobacion";
import { listarComprobantesPendientes } from "@/services/comprobantes";
import { listarPendientesGHL } from "@/services/ghl-aprobacion";
import type { KBISugerenciaItem } from "@/app/(dashboard)/admin/aprobaciones/KBISugerenciaCard";
import type { RecursoActual } from "@/app/(dashboard)/admin/aprobaciones/KBISugerenciaModal";
import type { SugerenciaItem, ClusterItem } from "@/app/(dashboard)/admin/aprobaciones/ColaSugerenciasSeccion";
import type { ItemAprobacionGHL } from "@/services/ghl-aprobacion";
import type { MensajeEnCola } from "@/services/mensajes-aprobacion";
import type { ComprobanteEnCola } from "@/services/comprobantes";
import type { Etiqueta } from "@/services/etiquetas";

export type KBItem = {
  id: string; tipo: string; titulo: string; contenido: string; origen: string; created_at: string;
};

export type MatrizItem = {
  id: string; dimensiones: Record<string, string>; respuesta_sugerida: string; origen: string; created_at: string;
};

export interface AprobacionesData {
  kb: KBItem[];
  matriz: MatrizItem[];
  sugerencias: SugerenciaItem[];
  clusters: ClusterItem[];
  kbiItems: KBISugerenciaItem[];
  mapaKBIRecursos: Record<string, RecursoActual>;
  etiquetasPendientes: (Etiqueta & { categoria_nombre: string })[];
  mensajesPendientes: (MensajeEnCola & { lead_nombre: string | null })[];
  comprobantesPendientes: ComprobanteEnCola[];
  pendientesGHL: ItemAprobacionGHL[];
  totalPendientes: number;
}

async function verificarAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: p } = await (createServiceClient() as any)
      .from("profiles").select("rol").eq("id", user.id).single();
    return p?.rol === "admin";
  } catch { return false; }
}

export async function fetchAprobacionesData(): Promise<AprobacionesData> {
  const supabase = createServiceClient() as any;

  const [
    { data: kb },
    { data: matriz },
    { data: sugerencias },
    { data: clusters },
    { data: kbiSugerencias },
    etiquetasPendientes,
    mensajesPendientes,
    comprobantesPendientes,
    pendientesGHL,
  ] = await Promise.all([
    supabase.from("recursos_conocimiento")
      .select("id, tipo, titulo, contenido, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("matriz_nd")
      .select("id, dimensiones, respuesta_sugerida, origen, created_at")
      .eq("aprobado", false).order("created_at"),
    supabase.from("sugerencias_ia")
      .select("id, tipo, titulo, descripcion, prioridad, created_at, tipo_brief, servicio_id, cluster_id, metadata")
      .is("aprobado", null).neq("tipo", "kb_calidad")
      .order("prioridad").order("created_at"),
    supabase.from("clusters_sugerencias")
      .select("id, titulo_generado, conteo").order("conteo", { ascending: false }),
    supabase.from("kbi_sugerencias")
      .select("id, recurso_id, tipo_accion, tipo_recurso_nuevo, titulo_propuesto, contenido_propuesto, razon, origen, created_at")
      .eq("estado", "pendiente").order("created_at"),
    listarPendientes(),
    listarMensajesPendientes(),
    listarComprobantesPendientes(),
    listarPendientesGHL().catch(() => [] as ItemAprobacionGHL[]),
  ]);

  const kbiItems = (kbiSugerencias ?? []) as KBISugerenciaItem[];
  const kbiRecursoIds = [...new Set(kbiItems.map(s => s.recurso_id).filter(Boolean) as string[])];
  const mapaKBIRecursos: Record<string, RecursoActual> = {};
  if (kbiRecursoIds.length > 0) {
    const { data: kbiRecursos } = await supabase
      .from("recursos_conocimiento").select("id, titulo, contenido").in("id", kbiRecursoIds);
    for (const r of (kbiRecursos ?? []) as { id: string; titulo: string; contenido: string }[]) {
      mapaKBIRecursos[r.id] = { titulo: r.titulo, contenido: r.contenido };
    }
  }

  const totalPendientes =
    (kb?.length ?? 0) + (matriz?.length ?? 0) + (sugerencias?.length ?? 0) +
    kbiItems.length + etiquetasPendientes.length +
    mensajesPendientes.length + comprobantesPendientes.length + pendientesGHL.length;

  return {
    kb: (kb ?? []) as KBItem[],
    matriz: (matriz ?? []).map((m: any) => ({ ...m, dimensiones: m.dimensiones as Record<string, string> })),
    sugerencias: (sugerencias ?? []).map((s: any) => ({ ...s, metadata: (s.metadata ?? {}) as Record<string, unknown> })),
    clusters: (clusters ?? []) as ClusterItem[],
    kbiItems,
    mapaKBIRecursos,
    etiquetasPendientes,
    mensajesPendientes,
    comprobantesPendientes,
    pendientesGHL,
    totalPendientes,
  };
}

export async function GET() {
  if (!await verificarAdmin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(await fetchAprobacionesData());
}
