import { listarLeads, obtenerEtapas } from "@/services/pipeline";
import { LeadsList } from "@/components/leads/leads-list";

export const metadata = { title: "Leads · ECMatic" };
export const revalidate = 0;

export default async function LeadsPage() {
  const [leads, etapasTripwire, etapasPremium] = await Promise.all([
    listarLeads({ activo: true }),
    obtenerEtapas("tripwire"),
    obtenerEtapas("premium"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads activos</p>
        </div>
      </div>
      <LeadsList
        leads={leads}
        etapasTripwire={etapasTripwire}
        etapasPremium={etapasPremium}
      />
    </div>
  );
}
