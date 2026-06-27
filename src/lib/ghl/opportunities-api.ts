import { ghlGet, ghlPost, ghlPut } from "./client";

export interface GHLOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: "open" | "won" | "lost" | "abandoned";
  contactId: string;
  monetaryValue?: number;
  updatedAt?: string;
  createdAt?: string;
}

const locationId = () => process.env.GHL_LOCATION_ID!;

export async function buscarOportunidadContacto(
  contactId: string,
  pipelineId: string
): Promise<GHLOpportunity | null> {
  const data = await ghlGet<{ opportunities: GHLOpportunity[] }>(
    "/opportunities/search",
    { location_id: locationId(), contact_id: contactId, pipeline_id: pipelineId }
  );
  return data.opportunities?.[0] ?? null;
}

export async function crearOportunidadGHL(
  contactId: string,
  pipelineId: string,
  stageId: string,
  nombre?: string
): Promise<GHLOpportunity> {
  const data = await ghlPost<{ opportunity: GHLOpportunity }>("/opportunities/", {
    pipelineId,
    locationId: locationId(),
    name: nombre ?? "Lead SBC",
    stageId,
    status: "open",
    contactId,
  });
  return data.opportunity;
}

export async function actualizarEtapaOportunidad(
  opportunityId: string,
  stageId: string
): Promise<void> {
  await ghlPut(`/opportunities/${opportunityId}`, { stageId });
}

// Crea la oportunidad si no existe; actualiza etapa si ya existe.
export async function upsertOportunidadGHL(
  contactId: string,
  pipelineId: string,
  stageId: string,
  nombre?: string
): Promise<void> {
  const existente = await buscarOportunidadContacto(contactId, pipelineId);
  if (existente) {
    await actualizarEtapaOportunidad(existente.id, stageId);
  } else {
    await crearOportunidadGHL(contactId, pipelineId, stageId, nombre);
  }
}
