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

// GHL-9.5 — Busca un contacto en GHL por número de teléfono.
// Si no existe, lo crea con el nombre del lead. Retorna el contactId.
export async function buscarOCrearContactoGHL(
  telefono: string,
  nombre?: string | null
): Promise<string | null> {
  const locationId = process.env.GHL_LOCATION_ID!;

  try {
    const busqueda = await ghlPost<SearchResponse>("/contacts/search", {
      locationId,
      filters: [{ field: "phone", operator: "eq", value: telefono }],
      pageLimit: 1,
    });

    if (busqueda.contacts?.length) return busqueda.contacts[0].id;

    // No existe — crear contacto en GHL
    const creado = await ghlPost<{ contact: GHLContact }>("/contacts/", {
      locationId,
      phone: telefono,
      ...(nombre ? { name: nombre } : {}),
    });

    return creado.contact?.id ?? null;
  } catch {
    return null;
  }
}
