"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  aprobarReglaAction,
  desactivarReglaAction,
  editarReglaAction,
} from "@/app/(dashboard)/admin/reglas/actions";

export type ReglaRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  condiciones: Record<string, unknown>;
  instruccion: string;
  prioridad: number;
  activa: boolean;
  aprobada: boolean;
  usos: number;
  cierres: number;
  score: number;
  origen: string;
  created_at: string;
};

const TIPO_BADGES: Record<string, string> = {
  tactica:     "bg-blue-100 text-blue-800",
  urgencia:    "bg-orange-100 text-orange-800",
  restriccion: "bg-red-100 text-red-800",
  producto:    "bg-purple-100 text-purple-800",
  rebate:      "bg-green-100 text-green-800",
};

const TIPO_LABELS: Record<string, string> = {
  tactica: "Táctica", urgencia: "Urgencia", restriccion: "Restricción",
  producto: "Producto", rebate: "Rebate",
};

export function ReglaCard({ regla }: { regla: ReglaRow }) {
  const [editando, setEditando] = useState(false);
  const [instruccion, setInstruccion] = useState(regla.instruccion);
  const [condiciones, setCondiciones] = useState(
    Object.keys(regla.condiciones).length
      ? JSON.stringify(regla.condiciones, null, 2)
      : ""
  );
  const [pending, startTransition] = useTransition();

  const tieneCondiciones = Object.keys(regla.condiciones).length > 0;
  const scoreConversion  = regla.usos > 0
    ? ((regla.cierres / regla.usos) * 100).toFixed(0) + "%"
    : "—";

  function handleAprobar() {
    const fd = new FormData();
    fd.set("id", regla.id);
    startTransition(async () => {
      await aprobarReglaAction(fd);
      toast.success("Regla aprobada");
    });
  }

  function handleToggleActiva() {
    const fd = new FormData();
    fd.set("id", regla.id);
    fd.set("activa", String(regla.activa));
    startTransition(async () => {
      await desactivarReglaAction(fd);
      toast.success(regla.activa ? "Regla desactivada" : "Regla activada");
    });
  }

  function handleGuardar() {
    const fd = new FormData();
    fd.set("id", regla.id);
    fd.set("instruccion", instruccion);
    fd.set("condiciones", condiciones);
    startTransition(async () => {
      await editarReglaAction(fd);
      toast.success("Regla actualizada");
      setEditando(false);
    });
  }

  return (
    <Card className={!regla.activa ? "opacity-60" : undefined}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIPO_BADGES[regla.tipo] ?? "bg-gray-100 text-gray-800"}`}>
              {TIPO_LABELS[regla.tipo] ?? regla.tipo}
            </span>
            <span className="text-sm font-semibold">{regla.nombre}</span>
            {!regla.aprobada && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                Pendiente
              </Badge>
            )}
            {!regla.activa && (
              <Badge variant="outline" className="text-xs text-gray-500">Inactiva</Badge>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <span className="text-xs text-muted-foreground">P:{regla.prioridad}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {regla.usos} usos · {scoreConversion} conv.
            </span>
          </div>
        </div>
        {regla.descripcion && (
          <p className="text-xs text-muted-foreground mt-1">{regla.descripcion}</p>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Condiciones */}
        {tieneCondiciones && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">SI:</p>
            <div className="flex flex-wrap gap-1">
              {(regla.condiciones.tags_ghl as string[] | undefined)?.map(t => (
                <code key={String(t)} className="text-xs bg-muted px-1.5 py-0.5 rounded">{String(t)}</code>
              ))}
              {!!regla.condiciones.temperamento && (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  temperamento={String(regla.condiciones.temperamento)}
                </code>
              )}
              {!!regla.condiciones.pipeline_stage && (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  etapa={String(regla.condiciones.pipeline_stage)}
                </code>
              )}
            </div>
          </div>
        )}
        {!tieneCondiciones && (
          <p className="text-xs text-muted-foreground italic">Aplica siempre (sin condiciones)</p>
        )}

        {/* Instrucción */}
        {editando ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Instrucción</Label>
              <Textarea
                value={instruccion}
                onChange={e => setInstruccion(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Condiciones (JSON)</Label>
              <Textarea
                value={condiciones}
                onChange={e => setCondiciones(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleGuardar} disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">ENTONCES:</p>
            <p className="text-sm">{regla.instruccion}</p>
          </div>
        )}

        {/* Acciones */}
        {!editando && (
          <div className="flex gap-2 pt-1">
            {!regla.aprobada && (
              <Button size="sm" onClick={handleAprobar} disabled={pending}>
                Aprobar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleActiva}
              disabled={pending}
              className="text-muted-foreground"
            >
              {regla.activa ? "Desactivar" : "Activar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
