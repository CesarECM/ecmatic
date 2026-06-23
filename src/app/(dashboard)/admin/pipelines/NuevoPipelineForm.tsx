"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { crearPipelineAction } from "./actions";

const FASES_CAGC = [
  "0-Inconsciencia", "1-Activación", "2-Definición del problema",
  "3-Exploración inicial", "4-Consciencia de soluciones", "5-Construcción de criterios",
  "6-Evaluación de opciones", "7-Validación social", "8-Ansiedad pre-decisión",
  "9-Decisión de compra", "10-Acto de compra", "11-Disonancia post-compra",
  "12-Evaluación de experiencia", "13-Satisfacción/Insatisfacción",
  "14-Retención", "15-Lealtad", "16-Advocacy",
];

export function NuevoPipelineForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button size="sm" onClick={() => setOpen(true)}>+ Nuevo pipeline</Button>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tid = toast.loading("Creando pipeline…");
        startTransition(async () => {
          try {
            await crearPipelineAction(fd);
            toast.success("Pipeline creado — el auditor IA lo analizará", { id: tid });
            setOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear", { id: tid });
          }
        });
      }}
      className="flex flex-col gap-3 w-80 p-4 rounded-lg border bg-card shadow-sm"
    >
      <p className="text-sm font-semibold">Nuevo pipeline</p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Nombre *</label>
        <Input name="nombre" required placeholder="Ej: Certificación Grupal" className="text-sm" />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descripción</label>
        <Textarea name="descripcion" rows={2} placeholder="Propósito del pipeline" className="text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <select name="tipo" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="tronco">Tronco</option>
            <option value="rama">Rama</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fase CAGC inicio</label>
          <select name="fase_cagc_inicio" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">—</option>
            {FASES_CAGC.map((f, i) => (
              <option key={i} value={i}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Fase CAGC fin</label>
        <select name="fase_cagc_fin" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
          <option value="">—</option>
          {FASES_CAGC.map((f, i) => (
            <option key={i} value={i}>{f}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? "Creando…" : "Crear pipeline"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
