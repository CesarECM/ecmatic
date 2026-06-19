"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moverLeadAction } from "@/app/(dashboard)/admin/leads/actions";
import type { LeadRow } from "@/services/pipeline";

type Etapa = { id: string; nombre: string; orden: number };

interface LeadsListProps {
  leads: LeadRow[];
  etapasTripwire: Etapa[];
  etapasPremium: Etapa[];
}

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-100 text-red-800",
  I: "bg-yellow-100 text-yellow-800",
  S: "bg-green-100 text-green-800",
  C: "bg-blue-100 text-blue-800",
};

function ScoreSalud({ score }: { score: number }) {
  const color = score >= 67 ? "text-green-600" : score >= 34 ? "text-yellow-600" : "text-red-600";
  return <span className={`text-sm font-semibold ${color}`}>{score}</span>;
}

export function LeadsList({ leads, etapasTripwire, etapasPremium }: LeadsListProps) {
  const [filtroRuta, setFiltroRuta] = useState<"todos" | "tripwire" | "premium">("todos");
  const [filtroEtapa, setFiltroEtapa] = useState("todas");

  const etapasActuales = filtroRuta === "premium" ? etapasPremium : etapasTripwire;

  const filtrados = leads.filter((l) => {
    if (filtroRuta !== "todos" && l.pipeline_ruta !== filtroRuta) return false;
    if (filtroEtapa !== "todas" && l.pipeline_stage !== filtroEtapa) return false;
    return true;
  });

  function etapasDeRuta(ruta: string) {
    return ruta === "premium" ? etapasPremium : etapasTripwire;
  }

  function etapaAnterior(lead: LeadRow) {
    const etapas = etapasDeRuta(lead.pipeline_ruta);
    const idx = etapas.findIndex((e) => e.nombre === lead.pipeline_stage);
    return idx > 0 ? etapas[idx - 1].nombre : null;
  }

  function etapaSiguiente(lead: LeadRow) {
    const etapas = etapasDeRuta(lead.pipeline_ruta);
    const idx = etapas.findIndex((e) => e.nombre === lead.pipeline_stage);
    return idx >= 0 && idx < etapas.length - 1 ? etapas[idx + 1].nombre : null;
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["todos", "tripwire", "premium"] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setFiltroRuta(r); setFiltroEtapa("todas"); }}
              className={`px-3 py-1.5 ${filtroRuta === r ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            >
              {r === "todos" ? "Todos" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={filtroEtapa}
          onChange={(e) => setFiltroEtapa(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="todas">Todas las etapas</option>
          {etapasActuales.map((e) => (
            <option key={e.id} value={e.nombre}>{e.nombre}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground self-center">
          {filtrados.length} lead{filtrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay leads con estos filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((lead) => {
            const prev = etapaAnterior(lead);
            const next = etapaSiguiente(lead);
            const nombre = lead.nombre ?? lead.telefono ?? "Sin nombre";

            return (
              <Card key={lead.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Identidad */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`/admin/leads/${lead.id}`}
                          className="font-medium text-sm hover:text-primary truncate"
                        >
                          {nombre}
                        </a>
                        {lead.compra_previa && (
                          <span className="text-xs text-green-600 font-medium">★ Recurrente</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.telefono ?? lead.email ?? "—"}</p>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{lead.pipeline_stage}</Badge>
                      <Badge variant="secondary" className="text-xs">{lead.pipeline_ruta}</Badge>
                      {lead.temperamento_inferido && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DISC_COLORS[lead.temperamento_inferido] ?? ""}`}>
                          {lead.temperamento_inferido}
                        </span>
                      )}
                      <ScoreSalud score={lead.score_salud} />
                    </div>

                    {/* Acciones de etapa */}
                    <div className="flex gap-1">
                      {prev && (
                        <form action={moverLeadAction}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="nuevaEtapa" value={prev} />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">←</Button>
                        </form>
                      )}
                      {next && (
                        <form action={moverLeadAction}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="nuevaEtapa" value={next} />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">→</Button>
                        </form>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
