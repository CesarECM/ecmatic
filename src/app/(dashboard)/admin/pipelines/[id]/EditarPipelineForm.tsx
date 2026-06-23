"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actualizarPipelineAction, eliminarPipelineAction } from "../actions";
import { useRouter } from "next/navigation";
import type { Pipeline } from "@/services/pipelines-admin";

const FASES_CAGC = [
  "0-Inconsciencia","1-Activación","2-Definición del problema","3-Exploración inicial",
  "4-Consciencia de soluciones","5-Construcción de criterios","6-Evaluación de opciones",
  "7-Validación social","8-Ansiedad pre-decisión","9-Decisión de compra","10-Acto de compra",
  "11-Disonancia post-compra","12-Evaluación de experiencia","13-Satisfacción/Insatisfacción",
  "14-Retención","15-Lealtad","16-Advocacy",
];

interface Props {
  pipeline: Pipeline;
}

export function EditarPipelineForm({ pipeline }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!editando) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
        Editar pipeline
      </Button>
    );
  }

  function handleEliminar() {
    if (!confirm(`¿Eliminar el pipeline "${pipeline.nombre}"? Solo es posible si no tiene leads activos.`)) return;
    startTransition(async () => {
      const tid = toast.loading("Eliminando pipeline…");
      try {
        await eliminarPipelineAction(pipeline.id);
        toast.success("Pipeline eliminado", { id: tid });
        router.push("/admin/pipelines");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar", { id: tid });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tid = toast.loading("Guardando…");
        startTransition(async () => {
          try {
            await actualizarPipelineAction(pipeline.id, fd);
            toast.success("Pipeline actualizado — el auditor IA lo analizará", { id: tid });
            setEditando(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al guardar", { id: tid });
          }
        });
      }}
      className="rounded-lg border bg-card p-4 space-y-3"
    >
      <p className="text-sm font-semibold">Editar pipeline</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre *</label>
          <Input name="nombre" required defaultValue={pipeline.nombre} className="text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <select name="tipo" defaultValue={pipeline.tipo} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="tronco">Tronco</option>
            <option value="rama">Rama</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descripción</label>
        <Textarea name="descripcion" defaultValue={pipeline.descripcion ?? ""} rows={2} className="text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fase CAGC inicio</label>
          <select name="fase_cagc_inicio" defaultValue={pipeline.fase_cagc_inicio ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">—</option>
            {FASES_CAGC.map((f, i) => <option key={i} value={i}>{f}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fase CAGC fin</label>
          <select name="fase_cagc_fin" defaultValue={pipeline.fase_cagc_fin ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">—</option>
            {FASES_CAGC.map((f, i) => <option key={i} value={i}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" name="activo" id="activo-check" value="true" defaultChecked={pipeline.activo} />
        <label htmlFor="activo-check" className="text-xs">Pipeline activo</label>
      </div>

      <div className="flex gap-2 pt-1 border-t">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
        <Button type="button" size="sm" variant="destructive" onClick={handleEliminar} disabled={pending}>Eliminar</Button>
      </div>
    </form>
  );
}
