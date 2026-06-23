import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listarPipelines } from "@/services/pipelines-admin";
import { NuevoPipelineForm } from "./NuevoPipelineForm";

export const metadata = { title: "Pipelines · ECMatic" };
export const revalidate = 0;

const FASES = [
  "Inconsciencia","Activación","Definición del problema","Exploración inicial",
  "Consciencia de soluciones","Construcción de criterios","Evaluación de opciones",
  "Validación social","Ansiedad pre-decisión","Decisión de compra","Acto de compra",
  "Disonancia post-compra","Evaluación de experiencia","Satisfacción/Insatisfacción",
  "Retención","Lealtad","Advocacy",
];

function faseBadge(n: number | null) {
  if (n === null) return "—";
  return `${n} · ${FASES[n] ?? ""}`;
}

export default async function PipelinesPage() {
  const pipelines = await listarPipelines();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipelines</h1>
          <p className="text-sm text-muted-foreground">
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} configurado{pipelines.length !== 1 ? "s" : ""} ·{" "}
            Las sugerencias del auditor IA aparecen en{" "}
            <Link href="/admin/aprobaciones" className="text-primary hover:underline">Aprobaciones →</Link>
          </p>
        </div>
        <NuevoPipelineForm />
      </div>

      {pipelines.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay pipelines configurados. Crea el primero con el botón de arriba.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pipelines.map((p) => (
          <Link
            key={p.id}
            href={`/admin/pipelines/${p.id}`}
            className="block rounded-lg border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-sm leading-snug">{p.nombre}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {p.descripcion ?? "Sin descripción"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant={p.tipo === "tronco" ? "default" : "secondary"} className="text-xs">
                  {p.tipo}
                </Badge>
                {!p.activo && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-muted-foreground mb-0.5">Fase inicio</p>
                <p className="font-medium truncate">{faseBadge(p.fase_cagc_inicio)}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-muted-foreground mb-0.5">Fase fin</p>
                <p className="font-medium truncate">{faseBadge(p.fase_cagc_fin)}</p>
              </div>
            </div>

            <div className="flex gap-3 text-xs text-muted-foreground border-t pt-2">
              <span>🔀 {p.total_etapas} etapas</span>
              <span>·</span>
              <span>👥 {p.leads_activos} leads activos</span>
              <span>·</span>
              <span className="truncate font-mono text-[10px]">{p.ruta}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
