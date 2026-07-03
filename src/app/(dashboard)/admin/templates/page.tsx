import { createServiceClient } from "@/lib/supabase/service";
import { TemplateCard } from "./TemplateCard";
import type { FollowupTemplate, EstadoTemplate } from "@/services/followup-templates";

export const revalidate = 0;

type TipoFiltro = "todos" | "nurturing" | "conversational" | "payment" | "demo_agendado";

const ESTADO_TABS: { key: EstadoTemplate | "todos"; label: string }[] = [
  { key: "todos",    label: "Todos" },
  { key: "conectado", label: "Conectados" },
  { key: "aprobado",  label: "Aprobados" },
  { key: "sugerido",  label: "Sugeridos" },
];

const TIPO_LABELS: Record<string, string> = {
  nurturing: "Nurturing", conversational: "Conversacional",
  payment: "Pago", demo_agendado: "Post-Demo",
};

interface PageProps {
  searchParams: Promise<{ estado?: string; tipo?: string }>;
}

export default async function TemplatesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const estadoFiltro = (params.estado ?? "todos") as EstadoTemplate | "todos";
  const tipoFiltro   = (params.tipo   ?? "todos") as TipoFiltro;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  let query = supabase
    .from("followup_templates")
    .select("*, angulo:followup_angulos(codigo, nombre)")
    .order("uso_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (estadoFiltro !== "todos") query = query.eq("estado", estadoFiltro);
  if (tipoFiltro   !== "todos") query = query.eq("tipo",   tipoFiltro);

  const { data: templates } = await query as {
    data: (FollowupTemplate & { angulo: { codigo: string; nombre: string } | null })[] | null;
  };

  // Conteos para los tabs
  const { data: conteos } = await supabase
    .from("followup_templates")
    .select("estado") as { data: { estado: string }[] | null };

  const conteoMap = (conteos ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.estado] = (acc[r.estado] ?? 0) + 1;
    acc.todos     = (acc.todos     ?? 0) + 1;
    return acc;
  }, {});

  const tipos = ["nurturing", "conversational", "payment", "demo_agendado"] as const;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Biblioteca de Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sugeridos → Aprobados → Conectados. Los Conectados se envían directo vía GHL Workflow, sin cola de aprobación.
        </p>
      </div>

      {/* Tabs de estado */}
      <div className="flex gap-1 flex-wrap border-b pb-2">
        {ESTADO_TABS.map(({ key, label }) => {
          const count = conteoMap[key] ?? 0;
          const href  = `?estado=${key}${tipoFiltro !== "todos" ? `&tipo=${tipoFiltro}` : ""}`;
          const activo = estadoFiltro === key;
          return (
            <a key={key} href={href}
              className={`rounded-t px-3 py-1.5 text-sm transition-colors ${
                activo
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {label}{count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
            </a>
          );
        })}
      </div>

      {/* Filtro de tipo */}
      <div className="flex gap-1 flex-wrap">
        {(["todos", ...tipos] as const).map((t) => {
          const href  = `?tipo=${t}${estadoFiltro !== "todos" ? `&estado=${estadoFiltro}` : ""}`;
          const activo = tipoFiltro === t;
          return (
            <a key={t} href={href}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                activo ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              {t === "todos" ? "Todos los tipos" : TIPO_LABELS[t]}
            </a>
          );
        })}
      </div>

      {/* Lista */}
      {!templates?.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay templates con estos filtros.
          {estadoFiltro === "sugerido" && " Los templates aparecen aquí automáticamente cuando la IA genera follow-ups."}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
