import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { obtenerPipeline } from "@/services/pipelines-admin";
import { listarEtapasAdmin } from "@/services/etapas-admin";
import { EtapaCard } from "@/components/pipelines/etapa-card";
import { NuevaEtapaForm } from "./NuevaEtapaForm";
import { EditarPipelineForm } from "./EditarPipelineForm";

export const revalidate = 0;

const FASES = [
  "Inconsciencia","Activación","Definición del problema","Exploración inicial",
  "Consciencia de soluciones","Construcción de criterios","Evaluación de opciones",
  "Validación social","Ansiedad pre-decisión","Decisión de compra","Acto de compra",
  "Disonancia post-compra","Evaluación de experiencia","Satisfacción/Insatisfacción",
  "Retención","Lealtad","Advocacy",
];

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PipelineDetallePage({ params }: Props) {
  const { id } = await params;

  let pipeline;
  try {
    pipeline = await obtenerPipeline(id);
  } catch {
    notFound();
  }

  const etapas = await listarEtapasAdmin(pipeline.ruta);

  const etapasIncompletas = etapas.filter(
    (e) => e.activo && (!e.sla_dias || !e.criterios_salida || e.canales.length === 0)
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground">
        <Link href="/admin/pipelines" className="hover:text-foreground">Pipelines</Link>
        {" / "}
        <span>{pipeline.nombre}</span>
      </div>

      {/* Header del pipeline */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{pipeline.nombre}</h1>
            <Badge variant={pipeline.tipo === "tronco" ? "default" : "secondary"}>{pipeline.tipo}</Badge>
            {!pipeline.activo && <Badge variant="outline">Inactivo</Badge>}
          </div>
          {pipeline.descripcion && (
            <p className="text-sm text-muted-foreground mt-1">{pipeline.descripcion}</p>
          )}
          <div className="flex gap-3 text-xs text-muted-foreground mt-1.5">
            <span>Slug: <code className="font-mono">{pipeline.ruta}</code></span>
            {pipeline.fase_cagc_inicio !== null && (
              <span>CAGC: {pipeline.fase_cagc_inicio}-{FASES[pipeline.fase_cagc_inicio]} → {pipeline.fase_cagc_fin}-{FASES[pipeline.fase_cagc_fin ?? 0]}</span>
            )}
          </div>
        </div>
        <EditarPipelineForm pipeline={pipeline} />
      </div>

      {/* Alerta de etapas incompletas */}
      {etapasIncompletas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>{etapasIncompletas.length} etapa{etapasIncompletas.length !== 1 ? "s" : ""} incompleta{etapasIncompletas.length !== 1 ? "s" : ""}:</strong>{" "}
          {etapasIncompletas.map((e) => e.nombre).join(", ")} — sin SLA, criterio de salida o canal de contacto.
        </div>
      )}

      {/* Lista de etapas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">
            Etapas ({etapas.length})
          </h2>
          <NuevaEtapaForm pipelineId={id} ruta={pipeline.ruta} />
        </div>

        {etapas.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin etapas todavía. Crea la primera con el botón de arriba.
          </div>
        )}

        <div className="space-y-2">
          {etapas.map((etapa) => (
            <EtapaCard
              key={etapa.id}
              etapa={etapa}
              todasEtapas={etapas}
              pipelineId={id}
              ruta={pipeline.ruta}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Las sugerencias del auditor IA aparecen en{" "}
        <Link href="/admin/aprobaciones" className="text-primary hover:underline">Aprobaciones →</Link>
      </p>
    </div>
  );
}
