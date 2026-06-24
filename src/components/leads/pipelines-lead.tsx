"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moverLeadEnPipelineAction } from "@/app/(dashboard)/admin/leads/[id]/actions";

type PipelineActivo = {
  id: string;
  ruta: string;
  etapa_actual: string;
  fases_cagc: number[];
  updated_at: string;
};

type EtapaSimple = { nombre: string; orden: number };

type Movimiento = {
  id: string;
  etapa_anterior: string | null;
  etapa_nueva: string;
  motivo: string | null;
  movido_por: string;
  ruta: string | null;
  created_at: string;
};

interface Props {
  leadId: string;
  pipelines: PipelineActivo[];
  etapasPorRuta: Record<string, EtapaSimple[]>;
  historial: Movimiento[];
}

export function PipelinesLead({ leadId, pipelines, etapasPorRuta, historial }: Props) {
  const [historialVisible, setHistorialVisible] = useState(false);

  if (!pipelines.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sin pipelines activos para este lead.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {pipelines.map((pl) => {
        const etapas = etapasPorRuta[pl.ruta] ?? [];
        const idxActual = etapas.findIndex((e) => e.nombre === pl.etapa_actual);
        const pct =
          etapas.length > 1
            ? Math.round((Math.max(0, idxActual) / (etapas.length - 1)) * 100)
            : 100;

        return (
          <Card key={pl.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded break-all">
                  {pl.ruta}
                </span>
                <Badge className="text-xs shrink-0">{pl.etapa_actual}</Badge>
                {pl.fases_cagc.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    CAGC {pl.fases_cagc.join(", ")}
                  </span>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {etapas.length > 1 && (
                <div>
                  {/* Barra de progreso */}
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span className="truncate max-w-[40%]">{etapas[0]?.nombre}</span>
                    <span className="font-medium">{pct}%</span>
                    <span className="truncate max-w-[40%] text-right">
                      {etapas[etapas.length - 1]?.nombre}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Dots de etapas */}
                  <div className="flex items-start justify-between mt-2 gap-px overflow-x-auto">
                    {etapas.map((e, i) => (
                      <div
                        key={e.nombre}
                        className="flex flex-col items-center flex-1 min-w-0"
                        title={e.nombre}
                      >
                        <div
                          className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                            i < idxActual
                              ? "bg-primary border-primary"
                              : i === idxActual
                              ? "bg-primary border-primary ring-2 ring-primary/25"
                              : "bg-background border-muted-foreground/30"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mover etapa */}
              <form action={moverLeadEnPipelineAction} className="flex gap-2">
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="ruta" value={pl.ruta} />
                <select
                  name="nuevaEtapa"
                  defaultValue={pl.etapa_actual}
                  className="flex-1 text-sm border rounded-md px-2 py-1.5 bg-background"
                >
                  {etapas.length > 0 ? (
                    etapas.map((e) => (
                      <option key={e.nombre} value={e.nombre}>
                        {e.nombre}
                      </option>
                    ))
                  ) : (
                    <option value={pl.etapa_actual}>{pl.etapa_actual}</option>
                  )}
                </select>
                <Button type="submit" size="sm" variant="outline">
                  Mover
                </Button>
              </form>

              <p className="text-[10px] text-muted-foreground">
                Actualizado {new Date(pl.updated_at).toLocaleDateString("es-MX")}
              </p>
            </CardContent>
          </Card>
        );
      })}

      {/* Historial colapsable */}
      {historial.length > 0 && (
        <div className="border rounded-lg">
          <button
            onClick={() => setHistorialVisible((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors"
          >
            <span className="text-muted-foreground">Historial de movimientos</span>
            <span className="text-xs text-muted-foreground">
              {historial.length} {historialVisible ? "▲" : "▼"}
            </span>
          </button>

          {historialVisible && (
            <div className="border-t px-4 pb-3 pt-2 space-y-2">
              {historial.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString("es-MX")}
                  </span>
                  {m.ruta && (
                    <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {m.ruta.split("_").slice(0, 2).join("_")}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {m.etapa_anterior ?? "—"}
                  </span>
                  <span>→</span>
                  <span className="font-medium">{m.etapa_nueva}</span>
                  <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                    {m.movido_por}
                  </Badge>
                  {m.motivo && (
                    <span className="text-muted-foreground truncate">{m.motivo}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
