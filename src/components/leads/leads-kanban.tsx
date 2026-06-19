"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moverLeadAction } from "@/app/(dashboard)/admin/leads/actions";
import type { LeadRow } from "@/services/pipeline";

type Etapa = { id: string; nombre: string; orden: number };

interface LeadsKanbanProps {
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

function KanbanCard({ lead, etapas }: { lead: LeadRow; etapas: Etapa[] }) {
  const idx = etapas.findIndex((e) => e.nombre === lead.pipeline_stage);
  const prev = idx > 0 ? etapas[idx - 1].nombre : null;
  const next = idx < etapas.length - 1 ? etapas[idx + 1].nombre : null;
  const scoreColor =
    lead.score_salud >= 67 ? "text-green-600" : lead.score_salud >= 34 ? "text-yellow-600" : "text-red-600";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-3 space-y-2">
        <a
          href={`/admin/leads/${lead.id}`}
          className="font-medium text-sm hover:text-primary block truncate"
        >
          {lead.nombre ?? lead.telefono ?? "Sin nombre"}
        </a>
        <p className="text-xs text-muted-foreground truncate">{lead.telefono ?? lead.email ?? "—"}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {lead.temperamento_inferido && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${DISC_COLORS[lead.temperamento_inferido] ?? ""}`}>
              {lead.temperamento_inferido}
            </span>
          )}
          <span className={`text-xs font-semibold ${scoreColor}`}>{lead.score_salud}</span>
          {lead.compra_previa && <span className="text-xs text-green-600 font-medium">★</span>}
        </div>
        <div className="flex gap-1">
          {prev && (
            <form action={moverLeadAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="nuevaEtapa" value={prev} />
              <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs">←</Button>
            </form>
          )}
          {next && (
            <form action={moverLeadAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="nuevaEtapa" value={next} />
              <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs">→</Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadsKanban({ leads, etapasTripwire, etapasPremium }: LeadsKanbanProps) {
  const [ruta, setRuta] = useState<"tripwire" | "premium">("tripwire");
  const etapas = ruta === "tripwire" ? etapasTripwire : etapasPremium;
  const leadsRuta = leads.filter((l) => l.pipeline_ruta === ruta);

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border overflow-hidden text-sm w-fit">
        {(["tripwire", "premium"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRuta(r)}
            className={`px-4 py-1.5 ${ruta === r ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {etapas.map((etapa) => {
          const leadsEtapa = leadsRuta.filter((l) => l.pipeline_stage === etapa.nombre);
          return (
            <div key={etapa.id} className="min-w-[200px] w-[200px] flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium truncate">{etapa.nombre}</span>
                <Badge variant="secondary" className="text-xs">{leadsEtapa.length}</Badge>
              </div>
              <div className="space-y-2">
                {leadsEtapa.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    Vacío
                  </div>
                )}
                {leadsEtapa.map((lead) => (
                  <KanbanCard key={lead.id} lead={lead} etapas={etapas} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
