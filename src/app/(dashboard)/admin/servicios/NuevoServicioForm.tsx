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
            toast.success("Servicio creado", { id: tid });
            setOpen(false);
          } catch {
            toast.error("Error al crear", { id: tid });
          }
        });
      }}
      className="flex flex-col sm:flex-row gap-2 items-start"
    >
      <div className="flex flex-col gap-2 w-full sm:w-auto">
        <Input name="titulo" required placeholder="Nombre del servicio" className="text-sm w-64" />
        <Textarea name="contenido" required placeholder="Descripción breve…" rows={2} className="text-sm w-64" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Crear</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
