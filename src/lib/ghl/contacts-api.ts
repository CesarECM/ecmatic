import { ghlGet, ghlPost, ghlPut, ghlDelete } from "./client";

export interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  dateAdded?: string;
}

interface SearchResponse {
  contacts: GHLContact[];
  count?: number;
  total?: number;
}

export async function buscarContactosPorTag(
  tag: string,
  page = 1,
  pageLimit = 100
): Promise<{ contacts: GHLContact[]; total: number }> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const data = await ghlPost<SearchResponse>("/contacts/search", {
    locationId,
    filters: [{ field: "tags", operator: "contains", value: tag }],
    page,
    pageLimit,
  });
  return { contacts: data.contacts ?? [], total: data.total ?? data.count ?? 0 };
}

export async function obtenerContacto(contactId: string): Promise<GHLContact> {
  const data = await ghlGet<{ contact: GHLContact }>(`/contacts/${contactId}`);
  return data.contact;
}

export async function agregarTagsContacto(contactId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  await ghlPut(`/contacts/${contactId}/tags`, { tags });
}

export async function eliminarTagsContacto(contactId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  await ghlDelete(`/contacts/${contactId}/tags`, { tags });
}
