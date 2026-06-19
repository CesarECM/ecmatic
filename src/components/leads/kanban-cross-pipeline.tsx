"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface PipelinePos {
  ruta: string;
  etapa_actual: string;
}

interface KanbanCrossPipelineProps {
  leadNombre: string;
  pipelines: PipelinePos[];
  open: boolean;
  onClose: () => void;
}

const RUTA_LABEL: Record<string, string> = {
  tripwire: "Tripwire · $1,799",
  premium:  "Premium · $10,000+",
};

const ETAPA_CAGC: Record<string, string> = {
  Nuevo:           "Fases 1-3 · Activación → Exploración",
  Contactado:      "Fases 3-4 · Exploración → Soluciones",
  "Primer contacto": "Fases 2-4 · Definición → Soluciones",
  Diagnóstico:     "Fases 3-5 · Exploración → Criterios",
  Interesado:      "Fases 4-6 · Soluciones → Evaluación",
  Propuesta:       "Fases 5-7 · Criterios → Validación",
  Negociación:     "Fases 7-8 · Validación → Ansiedad",
  Seguimiento:     "Fases 7-8 · Validación → Ansiedad",
  Decisión:        "Fases 8-9 · Ansiedad → Decisión",
  Comprado:        "Fases 9-10 · Decisión → Transacción",
  Perdido:         "Fase no determinada",
  Certificado:     "Fases 12-15 · Post-compra → Lealtad",
};

export function KanbanCrossPipeline({
  leadNombre,
  pipelines,
  open,
  onClose,
}: KanbanCrossPipelineProps) {
  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base truncate">{leadNombre}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Participación simultánea en {pipelines.length} pipelines
          </p>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {pipelines.map((p) => (
            <div key={p.ruta} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {RUTA_LABEL[p.ruta] ?? p.ruta}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {p.etapa_actual}
                </Badge>
              </div>
              {ETAPA_CAGC[p.etapa_actual] && (
                <p className="text-xs text-muted-foreground">
                  {ETAPA_CAGC[p.etapa_actual]}
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
