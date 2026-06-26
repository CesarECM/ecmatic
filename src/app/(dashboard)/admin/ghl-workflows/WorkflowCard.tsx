"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { clasificarWorkflowAction, guardarNotasAction } from "./actions";
import type { GHLWorkflow } from "@/services/ghl-workflows";

const BADGE: Record<string, { label: string; className: string }> = {
  keep:    { label: "✅ Conservar",  className: "bg-green-100 text-green-800 border-green-300" },
  rescue:  { label: "🔧 Rescatar",   className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  delete:  { label: "🗑 Eliminar",   className: "bg-red-100 text-red-800 border-red-300" },
  pending: { label: "⏳ Pendiente",  className: "bg-muted text-muted-foreground" },
};

const STATUS: Record<string, { label: string; className: string }> = {
  published: { label: "Publicado", className: "bg-blue-100 text-blue-800" },
  draft:     { label: "Borrador",  className: "bg-muted text-muted-foreground" },
};

export function WorkflowCard({ wf }: { wf: GHLWorkflow }) {
  const [notas, setNotas]       = useState(wf.notas ?? "");
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  function clasificar(c: "keep" | "rescue" | "delete") {
    startTransition(async () => {
      await clasificarWorkflowAction(wf.id, c);
      toast.success(`Workflow marcado como "${BADGE[c].label}"`);
    });
  }

  function guardarNotas() {
    startTransition(async () => {
      await guardarNotasAction(wf.id, notas);
      setEditando(false);
      toast.success("Notas guardadas");
    });
  }

  const badge  = BADGE[wf.clasificacion] ?? BADGE.pending;
  const status = STATUS[wf.status]       ?? STATUS.draft;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-snug truncate">{wf.nombre}</p>
          {wf.resumen_ia && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{wf.resumen_ia}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`text-xs ${status.className}`}>
            {status.label}
          </Badge>
          <Badge variant="outline" className={`text-xs ${badge.className}`}>
            {badge.label}
          </Badge>
        </div>
      </div>

      {/* Tags */}
      {(wf.tags_detectados ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(wf.tags_detectados ?? []).map((t) => (
            <span key={t} className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Botones clasificación */}
      <div className="flex gap-1.5 flex-wrap">
        <Button
          size="sm" variant={wf.clasificacion === "keep" ? "default" : "outline"}
          className="h-7 text-xs" disabled={pending}
          onClick={() => clasificar("keep")}
        >✅ Conservar</Button>
        <Button
          size="sm" variant={wf.clasificacion === "rescue" ? "default" : "outline"}
          className="h-7 text-xs" disabled={pending}
          onClick={() => clasificar("rescue")}
        >🔧 Rescatar</Button>
        <Button
          size="sm" variant={wf.clasificacion === "delete" ? "destructive" : "outline"}
          className="h-7 text-xs" disabled={pending}
          onClick={() => clasificar("delete")}
        >🗑 Eliminar</Button>
      </div>

      {/* Notas */}
      {editando ? (
        <div className="space-y-1.5">
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas sobre este workflow..."
            className="text-xs min-h-[60px] resize-none"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={pending} onClick={guardarNotas}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setEditando(true)}
        >
          {notas || "+ Agregar notas"}
        </button>
      )}
    </div>
  );
}
