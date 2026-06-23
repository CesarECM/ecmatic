"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { crearServicioAction } from "./actions";

export function NuevoServicioForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button size="sm" onClick={() => setOpen(true)}>+ Nuevo servicio</Button>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tid = toast.loading("Creando servicio…");
        startTransition(async () => {
          try {
            await crearServicioAction(fd);
            toast.success("Servicio creado — el auditor IA analizará el catálogo", { id: tid });
            setOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear", { id: tid });
          }
        });
      }}
      className="flex flex-col gap-3 w-72 p-4 rounded-lg border bg-card shadow-sm"
    >
      <p className="text-sm font-semibold">Nuevo servicio</p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Nombre del servicio *</label>
        <Input name="titulo" required placeholder="Ej: Evaluación EC0217.01" className="text-sm" />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Descripción breve *</label>
        <Textarea
          name="contenido"
          required
          placeholder="¿Qué hace este servicio y a quién va dirigido?"
          rows={3}
          className="text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Estándar CONOCER (opcional)</label>
        <Input name="estandar_conocer" placeholder="EC0217.01" className="text-sm" />
        <p className="text-[10px] text-muted-foreground">
          Si el título incluye varios estándares, el auditor IA sugerirá separarlos.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">Crear</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
