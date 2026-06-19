"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AlertaRecurso, MotivoAlerta } from "@/services/conocimiento";

const MOTIVO_CONFIG: Record<MotivoAlerta, { label: string; descripcion: string; color: string }> = {
  sin_uso:          { label: "Sin uso",           descripcion: "Activo 30+ días sin aparecer en ninguna respuesta",      color: "bg-yellow-100 text-yellow-800" },
  baja_confianza:   { label: "Baja confianza",    descripcion: "10+ usos pero score < 30% — revisa si el contenido sirve", color: "bg-red-100 text-red-800" },
  pendiente_antiguo:{ label: "Pendiente antiguo", descripcion: "Sin aprobar hace más de 7 días",                          color: "bg-orange-100 text-orange-800" },
};

interface AlertasKBProps {
  alertas: AlertaRecurso[];
}

export function AlertasKB({ alertas }: AlertasKBProps) {
  if (alertas.length === 0) return null;

  const porMotivo = alertas.reduce<Record<MotivoAlerta, AlertaRecurso[]>>(
    (acc, a) => { acc[a.motivo].push(a); return acc; },
    { sin_uso: [], baja_confianza: [], pendiente_antiguo: [] }
  );

  return (
    <Card className="border-yellow-200 bg-yellow-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-yellow-600">⚠</span>
          {alertas.length} recurso{alertas.length !== 1 ? "s" : ""} necesitan atención
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.entries(porMotivo) as [MotivoAlerta, AlertaRecurso[]][])
          .filter(([, items]) => items.length > 0)
          .map(([motivo, items]) => {
            const cfg = MOTIVO_CONFIG[motivo];
            return (
              <div key={motivo}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{cfg.descripcion}</span>
                </div>
                <ul className="space-y-1 pl-2">
                  {items.map((r) => (
                    <li key={r.id} className="text-sm flex items-center gap-2">
                      <Badge variant="outline" className="text-xs py-0">{r.tipo}</Badge>
                      <span className="text-muted-foreground truncate">{r.titulo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
