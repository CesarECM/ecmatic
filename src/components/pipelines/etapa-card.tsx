"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EtapaForm } from "./etapa-form";
import { actualizarEtapaAction, eliminarEtapaAction } from "@/app/(dashboard)/admin/pipelines/actions";
import type { EtapaAdmin, ActualizarEtapaInput } from "@/services/etapas-admin";

interface Props {
  etapa: EtapaAdmin;
  todasEtapas: EtapaAdmin[];
  pipelineId: string;
  ruta: string;
}

export function EtapaCard({ etapa, todasEtapas, pipelineId, ruta }: Props) {
  const [editando, setEditando] = useState(false);
  const [, startTransition] = useTransition();

  function handleEliminar() {
    if (!confirm(`¿Eliminar la etapa "${etapa.nombre}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const tid = toast.loading("Eliminando etapa…");
      try {
        await eliminarEtapaAction(pipelineId, ruta, etapa.id);
        toast.success("Etapa eliminada", { id: tid });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar", { id: tid });
      }
    });
  }

  const tieneAlerta = !etapa.sla_dias || !etapa.criterios_salida || etapa.canales.length === 0;

  return (
    <div className={`rounded-lg border bg-card transition-all ${tieneAlerta ? "border-amber-200" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground text-xs font-mono w-5 shrink-0">{etapa.orden}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-sm">{etapa.nombre}</span>
              {etapa.es_tronco && <Badge variant="secondary" className="text-[10px] px-1.5">Tronco</Badge>}
              {!etapa.activo  && <Badge variant="outline"    className="text-[10px] px-1.5">Inactivo</Badge>}
              {tieneAlerta    && <Badge variant="outline"    className="text-[10px] px-1.5 border-amber-400 text-amber-600">Incompleta</Badge>}
            </div>
            <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              {etapa.fases_cagc.length > 0 && <span>CAGC: {etapa.fases_cagc.join(", ")}</span>}
              {etapa.sla_dias  && <span>SLA {etapa.sla_dias}d</span>}
              {etapa.rotting_dias && <span>Rotting {etapa.rotting_dias}d</span>}
              {etapa.canales.length > 0 && <span>{etapa.canales.join(" · ")}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditando((v) => !v)} className="text-xs h-7 px-2">
            {editando ? "Cerrar" : "Editar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleEliminar} className="text-xs h-7 px-2 text-destructive hover:text-destructive">
            Eliminar
          </Button>
        </div>
      </div>

      {/* Resumen de propiedades cuando está cerrado */}
      {!editando && (
        <div className="px-4 pb-3 space-y-1.5">
          {etapa.criterios_entrada && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Entrada:</span> {etapa.criterios_entrada}
            </div>
          )}
          {etapa.criterios_salida && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Salida:</span> {etapa.criterios_salida}
            </div>
          )}
          {etapa.tareas_obligatorias.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">{etapa.tareas_obligatorias.length} tarea{etapa.tareas_obligatorias.length !== 1 ? "s" : ""} oblig.</span>{" "}
              · {etapa.plantillas_mensaje.length} plantilla{etapa.plantillas_mensaje.length !== 1 ? "s" : ""}
              · {etapa.condiciones_workflow.length} regla{etapa.condiciones_workflow.length !== 1 ? "s" : ""} workflow
            </div>
          )}
          {etapa.etapas_siguientes.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Siguiente(s):</span> {etapa.etapas_siguientes.join(" / ")}
            </div>
          )}
        </div>
      )}

      {/* Formulario de edición */}
      {editando && (
        <div className="px-4 pb-4">
          <EtapaForm
            etapa={etapa}
            todasEtapas={todasEtapas}
            onCancelar={() => setEditando(false)}
            onGuardar={async (data: ActualizarEtapaInput) => {
              await actualizarEtapaAction(pipelineId, ruta, etapa.id, data);
            }}
          />
        </div>
      )}
    </div>
  );
}
