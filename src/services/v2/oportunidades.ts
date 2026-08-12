import { createServiceClient } from "@/lib/supabase/service";
import type { V2Opportunity, V2Lead, V2OpportunityRow } from "@/lib/supabase/types.v2";

export interface V2OportunidadesData {
  accionable: V2OpportunityRow[];
  en_espera:  V2OpportunityRow[];
}

type RawRow = V2Opportunity & {
  lead: Pick<V2Lead, "id" | "nombre" | "telefono" | "email" | "ghl_contact_id" | "origen"> | null;
};

export async function listarOportunidades(): Promise<V2OportunidadesData> {
  const ahora = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient() as any)
    .from("v2_opportunities")
    .select("*, lead:v2_leads(id, nombre, telefono, email, ghl_contact_id, origen)")
    .eq("estado", "activa")
    .order("score_combinado", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`listarOportunidades: ${error.message}`);

  const rows = (data ?? []) as RawRow[];

  const mapped: V2OpportunityRow[] = rows
    .filter((r) => r.lead !== null)
    .map((r) => ({
      ...r,
      lead: r.lead!,
      pending_contact_points: 0,  // S147 calculará esto desde v2_contact_points
    }));

  return {
    accionable: mapped.filter(
      (r) => !r.fecha_reactivacion || r.fecha_reactivacion <= ahora
    ),
    en_espera: mapped.filter(
      (r) => !!r.fecha_reactivacion && r.fecha_reactivacion > ahora
    ),
  };
}
