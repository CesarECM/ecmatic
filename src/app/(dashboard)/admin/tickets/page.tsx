import { createServiceClient } from "@/lib/supabase/service";
import { TicketsList } from "@/components/tickets/tickets-list";
import type { TicketConLead } from "@/components/tickets/tickets-list";

export const metadata = { title: "Tickets de Handoff · ECMatic" };
export const revalidate = 30;

export default async function TicketsPage() {
  const supabase = createServiceClient();

  // Consulta separada para evitar problemas de relaciones en tipos manuales
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, motivo, estado, resolucion, sugerencia_kb, created_at, updated_at, lead_id, vendedor_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const leadIds = [...new Set((tickets ?? []).map((t) => t.lead_id))];
  const { data: leads } = leadIds.length
    ? await supabase.from("leads").select("id, nombre, telefono, pipeline_stage").in("id", leadIds)
    : { data: [] };

  const leadsMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]));

  const ticketsConLead: TicketConLead[] = (tickets ?? []).map((t) => ({
    ...t,
    lead: leadsMap[t.lead_id] ?? null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tickets de Handoff</h1>
        <span className="text-sm text-muted-foreground">
          {ticketsConLead.filter((t) => t.estado === "abierto").length} abiertos
        </span>
      </div>
      <TicketsList tickets={ticketsConLead} />
    </div>
  );
}
