"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearProtocoloAction } from "../actions";

export function NuevoProtocoloForm() {
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);

  async function handleSubmit(fd: FormData) {
    setCreando(true);
    await crearProtocoloAction(fd);
  }

  if (!abierto) {
    return (
      <Button onClick={() => setAbierto(true)}>+ Nuevo protocolo</Button>
    );
  }

  return (
    <Card className="border-primary/30 w-80 sm:w-96">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Crear protocolo</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Nombre *</label>
            <input
              name="nombre"
              required
              placeholder="ej. 5 Toques Centro ECM"
              className="w-full text-sm border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Canal de activación (canal_origen)</label>
            <input
              name="trigger_canal_origen"
              placeholder="ej. no_show"
              className="w-full text-sm border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Link de agendado [LINK]</label>
            <input
              name="link_agendado"
              type="url"
              placeholder="https://calendar.google.com/..."
              className="w-full text-sm border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Duración total (días)</label>
            <input
              name="dias_duracion"
              type="number"
              min="1"
              defaultValue="7"
              className="w-full text-sm border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Descripción</label>
            <input
              name="descripcion"
              placeholder="Para qué sirve este protocolo"
              className="w-full text-sm border rounded px-2 py-1.5"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={creando}>
              {creando ? "Creando…" : "Crear y configurar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
