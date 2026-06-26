import { listarWorkflows } from "@/services/ghl-workflows";
import { WorkflowCard } from "./WorkflowCard";
import { SincronizarBtn } from "./SincronizarBtn";

export const metadata = { title: "GHL Workflows · ECMatic" };
export const revalidate = 0;

const CLASIFICACIONES = [
  { value: "all",     label: "Todos"        },
  { value: "keep",    label: "✅ Conservar" },
  { value: "rescue",  label: "🔧 Rescatar"  },
  { value: "delete",  label: "🗑 Eliminar"  },
  { value: "pending", label: "⏳ Pendiente" },
];

export default async function GHLWorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ clasificacion?: string; status?: string }>;
}) {
  const sp            = await searchParams;
  const clasificacion = sp.clasificacion ?? "all";
  const status        = sp.status        ?? "all";

  let workflows: Awaited<ReturnType<typeof listarWorkflows>> = [];
  let errorMsg: string | null = null;

  try {
    workflows = await listarWorkflows({
      clasificacion: clasificacion !== "all" ? clasificacion : undefined,
      status:        status        !== "all" ? status        : undefined,
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const totales = {
    total:   workflows.length,
    keep:    workflows.filter((w) => w.clasificacion === "keep").length,
    rescue:  workflows.filter((w) => w.clasificacion === "rescue").length,
    delete:  workflows.filter((w) => w.clasificacion === "delete").length,
    pending: workflows.filter((w) => w.clasificacion === "pending").length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">GHL Workflows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totales.total} workflows · ✅ {totales.keep} · 🔧 {totales.rescue} · 🗑 {totales.delete} · ⏳ {totales.pending} pendiente
          </p>
        </div>
        <SincronizarBtn />
      </div>

      {/* Error de carga */}
      {errorMsg && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Error al cargar workflows:</strong> {errorMsg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {CLASIFICACIONES.map((c) => {
          const active = clasificacion === c.value;
          const href = new URLSearchParams({
            clasificacion: c.value,
            ...(status !== "all" ? { status } : {}),
          }).toString();
          return (
            <a
              key={c.value}
              href={`/admin/ghl-workflows?${href}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              {c.label}
            </a>
          );
        })}

        <span className="mx-1 text-muted-foreground">|</span>

        {[
          { value: "all",       label: "Todos los estados" },
          { value: "published", label: "Publicados"        },
          { value: "draft",     label: "Borradores"        },
        ].map((s) => {
          const active = status === s.value;
          const href = new URLSearchParams({
            status: s.value,
            ...(clasificacion !== "all" ? { clasificacion } : {}),
          }).toString();
          return (
            <a
              key={s.value}
              href={`/admin/ghl-workflows?${href}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-secondary text-secondary-foreground border-secondary"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              {s.label}
            </a>
          );
        })}
      </div>

      {/* Empty state */}
      {!errorMsg && workflows.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center space-y-3">
          <p className="text-muted-foreground text-sm">
            No hay workflows importados aún.
          </p>
          <p className="text-xs text-muted-foreground">
            Presiona <strong>⟳ Sincronizar GHL</strong> para importar los workflows desde GoHighLevel y clasificarlos con IA.
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {workflows.map((wf) => (
          <WorkflowCard key={wf.id} wf={wf} />
        ))}
      </div>
    </div>
  );
}
