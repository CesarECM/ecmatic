"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { responderTicketAction, tomarTicketAction } from "@/app/(dashboard)/admin/tickets/actions";

export type TicketConLead = {
  id: string;
  motivo: string;
  estado: string;
  resolucion: string | null;
  sugerencia_kb: unknown;
  created_at: string;
  lead_id: string;
  lead: { id: string; nombre: string | null; telefono: string | null; pipeline_stage: string } | null;
};

interface TicketsListProps {
  tickets: TicketConLead[];
}

export function TicketsList({ tickets }: TicketsListProps) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay tickets — ECMatic está manejando todo ✓
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <Card key={ticket.id} className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base font-medium">
                {ticket.lead?.nombre ?? ticket.lead?.telefono ?? "Lead desconocido"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {ticket.lead?.pipeline_stage}
                </span>
              </CardTitle>
              <EstadoBadge estado={ticket.estado} />
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{ticket.motivo}</p>
          </CardHeader>

          {ticket.estado !== "cerrado" && (
            <CardContent className="pt-0 space-y-2">
              {expandido === ticket.id ? (
                <form action={responderTicketAction} className="space-y-2">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="leadId" value={ticket.lead?.id ?? ""} />
                  <input type="hidden" name="telefono" value={ticket.lead?.telefono ?? ""} />
                  <Textarea
                    name="respuesta"
                    placeholder="Escribe tu respuesta — se enviará por WhatsApp al lead"
                    rows={3}
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" onClick={() => setExpandido(null)}>
                      Enviar y cerrar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandido(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setExpandido(ticket.id)}>
                    Responder por WhatsApp
                  </Button>
                  {ticket.estado === "abierto" && (
                    <form action={tomarTicketAction}>
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Tomar ticket
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </CardContent>
          )}

          {ticket.estado === "cerrado" && ticket.resolucion && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">✓ {ticket.resolucion}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    abierto: { label: "Abierto", variant: "default" },
    en_atencion: { label: "En atención", variant: "secondary" },
    cerrado: { label: "Cerrado", variant: "outline" },
  };
  const cfg = map[estado] ?? { label: estado, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
