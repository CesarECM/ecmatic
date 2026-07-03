import { ghlGet, ghlPost } from "./client";
import { logSistema } from "@/services/log-sistema";

export interface GHLWorkflowRaw {
  id:        string;
  name:      string;
  status:    "draft" | "published";
  version:   number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowsResponse {
  workflows: GHLWorkflowRaw[];
}

export async function fetchWorkflowsGHL(): Promise<GHLWorkflowRaw[]> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const data = await ghlGet<WorkflowsResponse>("/workflows/", { locationId });
  return data.workflows ?? [];
}

// MPS-26 S97 — Inscribe un contacto en un workflow de GHL.
// Usado para templates Conectados: GHL ejecuta el workflow (envío de template WA aprobado por Meta).
export async function inscribirEnWorkflow(
  ghlContactId: string,
  workflowId: string,
  meta?: { leadId?: string; traceId?: string },
): Promise<boolean> {
  try {
    await ghlPost(`/contacts/${ghlContactId}/workflow/${workflowId}`, {
      eventStartTime: new Date(Date.now() + 60_000).toISOString().replace("Z", "+00:00"),
    });

    void logSistema({
      categoria: "servicio", tipoAccion: "ghl.workflow.inscrito", fase: "ok",
      leadId: meta?.leadId, traceId: meta?.traceId,
      resultado: `contact:${ghlContactId.slice(-8)} workflow:${workflowId}`,
    });
    return true;
  } catch (err) {
    void logSistema({
      categoria: "servicio", tipoAccion: "ghl.workflow.inscrito", fase: "error",
      leadId: meta?.leadId, traceId: meta?.traceId,
      resultado: String(err).slice(0, 300),
      metadata: { ghlContactId, workflowId },
    });
    return false;
  }
}
