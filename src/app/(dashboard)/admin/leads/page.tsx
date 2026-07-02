import { listarLeads, obtenerEtapas } from "@/services/pipeline";
import { obtenerPipelinesActivosBatch } from "@/services/pipeline-multi";
import { LeadsList } from "@/components/leads/leads-list";
import { LeadsKanban } from "@/components/leads/leads-kanban";

export const metadata = { title: "Leads · ECMatic" };
export const revalidate = 0;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const vista = view === "kanban" ? "kanban" : "lista";

  const [leads, etapasTripwire, etapasPremium] = await Promise.all([
    listarLeads({ activo: true }).catch(() => []),
    obtenerEtapas("tripwire").catch(() => []),
    obtenerEtapas("premium").catch(() => []),
  ]);

  // S13.6 — Cargar posición multi-pipeline de todos los leads en una sola query
  const pipelinesActivos = leads.length > 0
    ? await obtenerPipelinesActivosBatch(leads.map((l) => l.id)).catch(() => ({}))
    : {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads activos</p>
        </div>
        <div className="flex rounded-md border overflow-hidden text-sm">
          <a
            href="/admin/leads"
            className={`px-3 py-1.5 ${vista === "lista" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Lista
          </a>
          <a
            href="/admin/leads?view=kanban"
            className={`px-3 py-1.5 ${vista === "kanban" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Kanban
          </a>
        </div>
      </div>

      {vista === "kanban" ? (
        <LeadsKanban
          leads={leads}
          etapasTripwire={etapasTripwire}
          etapasPremium={etapasPremium}
          pipelinesActivos={pipelinesActivos}
        />
      ) : (
        <LeadsList leads={leads} etapasTripwire={etapasTripwire} etapasPremium={etapasPremium} />
      )}
    </div>
  );
}
