import { createServiceClient } from "@/lib/supabase/service";
import type {
  V2ContactPoint,
  V2KbItem,
  V2KbxQueueRow,
  V2KbxReviewItem,
  V2Lead,
  V2TaskRow,
  V2AutoEnviadoRow,
} from "@/lib/supabase/types.v2";

const ESTADOS_ACTIVOS = ["pendiente_generacion", "generado"] as const;

export interface V2TareasData {
  items:          V2TaskRow[];
  kbPropuestos:   V2KbItem[];
  autoEnviados:   V2AutoEnviadoRow[];
  kbxPendientes:  V2KbxQueueRow[];
}

type RawRow = V2ContactPoint & {
  lead: Pick<V2Lead, "id" | "nombre" | "telefono" | "ghl_contact_id"> | null;
};

type RawAutoRow = {
  id:              string;
  confianza:       number;
  contenido_final: string | null;
  updated_at:      string;
  lead:            Pick<V2Lead, "id" | "nombre" | "telefono"> | null;
};

export async function listarTareas(): Promise<V2TareasData> {
  const db = createServiceClient() as any;

  const [cpResult, kbResult, autoResult, kbxResult] = await Promise.all([
    db
      .from("v2_contact_points")
      .select("*, lead:v2_leads(id, nombre, telefono, ghl_contact_id)")
      .in("estado", ESTADOS_ACTIVOS)
      .order("created_at", { ascending: true }),
    db
      .from("v2_kb_items")
      .select("*")
      .eq("estado", "propuesto")
      .order("created_at", { ascending: true }),
    db
      .from("v2_contact_points")
      .select("id, confianza, contenido_final, updated_at, lead:v2_leads(id, nombre, telefono)")
      .eq("estado", "enviado_automatico")
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("v2_kbx_review_queue")
      .select("*")
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true }),
  ]);

  if (cpResult.error) throw new Error(`listarTareas: ${cpResult.error.message}`);

  const items: V2TaskRow[] = ((cpResult.data ?? []) as RawRow[])
    .filter((r) => r.lead !== null)
    .map((r) => ({ ...r, lead: r.lead!, opportunity: null }));

  const autoEnviados: V2AutoEnviadoRow[] = ((autoResult.data ?? []) as RawAutoRow[])
    .filter((r) => r.lead !== null)
    .map((r) => ({ ...r, lead: r.lead! }));

  // Enriquecer kbx queue con el contenido de los KB items afectados
  const kbxRaw = (kbxResult.data ?? []) as V2KbxReviewItem[];
  const allKbIds = [...new Set(kbxRaw.flatMap((r) => r.kb_item_ids))];
  let kbxKbItems: Pick<V2KbItem, "id" | "tipo" | "contenido" | "score_confianza">[] = [];
  if (allKbIds.length > 0) {
    const { data: kbData } = await db
      .from("v2_kb_items")
      .select("id, tipo, contenido, score_confianza")
      .in("id", allKbIds);
    kbxKbItems = (kbData ?? []) as typeof kbxKbItems;
  }

  const kbxPendientes: V2KbxQueueRow[] = kbxRaw.map((r) => ({
    ...r,
    kb_items: r.kb_item_ids
      .map((kbId) => kbxKbItems.find((k) => k.id === kbId))
      .filter((k): k is NonNullable<typeof k> => k !== undefined),
  }));

  return {
    items,
    kbPropuestos: (kbResult.data ?? []) as V2KbItem[],
    autoEnviados,
    kbxPendientes,
  };
}
