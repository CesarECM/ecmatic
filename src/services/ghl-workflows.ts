import { createServiceClient } from "@/lib/supabase/service";
import { fetchWorkflowsGHL } from "@/lib/ghl/workflows-api";
import { clasificarWorkflow } from "@/lib/ai/clasificar-workflow";
import { logSistema } from "@/services/log-sistema";
import { randomUUID } from "crypto";

export interface GHLWorkflow {
  id:              string;
  ghl_id:          string;
  nombre:          string;
  status:          "draft" | "published";
  version:         number;
  pasos:           Record<string, unknown> | null;
  clasificacion:   "keep" | "rescue" | "delete" | "pending";
  notas:           string | null;
  resumen_ia:      string | null;
  tags_detectados: string[];
  ultima_sync:     string;
  created_at:      string;
  updated_at:      string;
}

// Sincroniza los 57 workflows de GHL con la tabla ghl_workflows.
// Clasifica con IA los que sean nuevos o hayan cambiado de status.
export async function sincronizarWorkflows(): Promise<{ insertados: number; actualizados: number; errores: number }> {
  const traceId = randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  void logSistema({ categoria: "servicio", tipoAccion: "ghl.sync_workflows", fase: "inicio", traceId });

  let workflows;
  try {
    workflows = await fetchWorkflowsGHL();
  } catch (err) {
    void logSistema({ categoria: "servicio", tipoAccion: "ghl.sync_workflows", fase: "error",
      traceId, resultado: String(err) });
    throw err;
  }

  const { data: existentes } = await supabase
    .from("ghl_workflows")
    .select("ghl_id, status, clasificacion");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existenteMap = new Map<string, { status: string; clasificacion: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (existentes ?? []).map((r: any) => [r.ghl_id, { status: r.status, clasificacion: r.clasificacion }])
  );

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;

  for (const wf of workflows) {
    const previo = existenteMap.get(wf.id);
    const esNuevo = !previo;
    const cambioPendiente = previo?.clasificacion === "pending";
    const cambioStatus = previo && previo.status !== wf.status;

    // Solo re-clasificar si es nuevo, está pendiente, o cambió de status
    const debeClasificar = esNuevo || cambioPendiente || cambioStatus;

    let clasificacion: "keep" | "rescue" | "delete" | "pending" = previo?.clasificacion as "keep" | "rescue" | "delete" | "pending" ?? "pending";
    let resumen_ia: string | null = null;
    let tags_detectados: string[] = [];

    if (debeClasificar) {
      try {
        const result = await clasificarWorkflow(wf.name, wf.status);
        clasificacion   = result.clasificacion;
        resumen_ia      = result.resumen_ia;
        tags_detectados = result.tags_detectados;
      } catch {
        errores++;
        clasificacion = "pending";
      }
    }

    const row = {
      ghl_id:          wf.id,
      nombre:          wf.name,
      status:          wf.status,
      version:         wf.version ?? 1,
      clasificacion,
      resumen_ia:      resumen_ia ?? undefined,
      tags_detectados: tags_detectados.length ? tags_detectados : undefined,
      ultima_sync:     new Date().toISOString(),
    };

    const { error } = await supabase
      .from("ghl_workflows")
      .upsert(row, { onConflict: "ghl_id" });

    if (error) {
      errores++;
    } else if (esNuevo) {
      insertados++;
    } else {
      actualizados++;
    }
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "ghl.sync_workflows", fase: "ok",
    traceId, resultado: `${insertados} nuevos · ${actualizados} actualizados · ${errores} errores`,
    metadata: { total: workflows.length, insertados, actualizados, errores },
  });

  return { insertados, actualizados, errores };
}

export async function listarWorkflows(filtros?: {
  clasificacion?: string;
  status?: string;
}): Promise<GHLWorkflow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  let q = supabase
    .from("ghl_workflows")
    .select("*")
    .order("status", { ascending: false }) // published primero
    .order("nombre");

  if (filtros?.clasificacion && filtros.clasificacion !== "all") {
    q = q.eq("clasificacion", filtros.clasificacion);
  }
  if (filtros?.status && filtros.status !== "all") {
    q = q.eq("status", filtros.status);
  }

  const { data, error } = await q;
  if (error) throw new Error(`ghl-workflows.listar: ${error.message}`);
  return (data ?? []) as GHLWorkflow[];
}

export async function actualizarWorkflow(
  id: string,
  cambios: { clasificacion?: "keep" | "rescue" | "delete"; notas?: string | null }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { error } = await supabase
    .from("ghl_workflows")
    .update({ ...cambios })
    .eq("id", id);
  if (error) throw new Error(`ghl-workflows.actualizar: ${error.message}`);
}
