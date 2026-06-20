"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { crearRecursoAction } from "@/app/(dashboard)/admin/conocimiento/actions";
import { RecursoCard, type RecursoRow } from "./RecursoCard";

export type { RecursoRow };

const TIPOS = [
  { value: "faq", label: "FAQ" },
  { value: "objecion", label: "Objeción" },
  { value: "servicio", label: "Servicio" },
  { value: "template_wa", label: "Template WA" },
  { value: "template_email", label: "Template Email" },
  { value: "practica_venta", label: "Práctica de venta" },
] as const;

export function RecursosList({ recursos }: { recursos: RecursoRow[] }) {
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const filtrados = recursos.filter((r) => {
    if (filtroTipo !== "todos" && r.tipo !== filtroTipo) return false;
    if (soloPendientes && r.aprobado) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="todos">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
            />
            Solo pendientes
          </label>
        </div>
        <Button size="sm" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo recurso"}
        </Button>
      </div>

      {mostrarForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nuevo recurso</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={async (fd) => {
                await crearRecursoAction(fd);
                setMostrarForm(false);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tipo">Tipo</Label>
                  <select name="tipo" id="tipo" required className="w-full text-sm border rounded-md px-3 py-1.5 bg-background">
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="titulo">Título</Label>
                  <Input id="titulo" name="titulo" required placeholder="Título del recurso" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="contenido">Contenido</Label>
                <Textarea id="contenido" name="contenido" required rows={4} placeholder="Contenido completo del recurso..." />
              </div>
              <Button type="submit" size="sm">Crear y aprobar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay recursos con estos filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((r) => <RecursoCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
