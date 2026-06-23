"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearEtapaAction } from "../actions";

interface Props {
  pipelineId: string;
  ruta: string;
}

export function NuevaEtapaForm({ pipelineId, ruta }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Nueva etapa
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tid = toast.loading("Creando etapa…");
        startTransition(async () => {
          try {
            await crearEtapaAction(pipelineId, ruta, fd);
            toast.success("Etapa creada — completa sus propiedades en el editor", { id: tid });
            setOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear", { id: tid });
          }
        });
      }}
      className="flex items-center gap-2 p-3 rounded-lg border bg-card"
    >
      <Input name="nombre" required placeholder="Nombre de la etapa" className="text-sm flex-1" autoFocus />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : "Crear"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}
