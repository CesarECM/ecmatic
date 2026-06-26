import { ghlGet } from "./client";

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
