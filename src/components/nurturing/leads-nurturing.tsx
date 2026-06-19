"use client";

import { useTransition, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dispararCicloAction } from "@/app/(dashboard)/admin/nurturing/actions";
import type { LeadParaNurturing } from "@/services/nurturing";

const CANAL_COLOR: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-800",
  email: "bg-blue-100 text-blue-800",
};

interface ResultadoCiclo {
  procesados: number;
  enviados: number;
  omitidos: number;
}

interface Props {
  leads: LeadParaNurturing[];
}

export function LeadsNurturing({ leads }: Props) {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<ResultadoCiclo | null>(null);

  function ejecutar() {
    startTransition(async () => {
      const res = await dispararCicloAction();
      setResultado(res);
    });
  }

  return (
    <div className="space-y-4">
      {/* Barra de acción + resultado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-sm">
            Leads elegibles para nurturing
          </h2>
          <p className="text-xs text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} inactivo{leads.length !== 1 ? "s" : ""} con secuencia aplicable
          </p>
        </div>
        <div className="flex items-center gap-3">
          {resultado && (
            <p className="text-xs text-muted-foreground">
              Último ciclo: <strong>{resultado.enviados}</strong> enviados · <strong>{resultado.omitidos}</strong> omitidos
            </p>
          )}
          <Button size="sm" onClick={ejecutar} disabled={pending}>
            {pending ? "Ejecutando..." : "Ejecutar ahora"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 px-4 text-left">Lead</th>
                  <th className="py-2 px-4 text-left">Etapa</th>
                  <th className="py-2 px-4 text-left">Ruta</th>
                  <th className="py-2 px-4 text-center">Días inactivo</th>
                  <th className="py-2 px-4 text-left">Secuencia</th>
                  <th className="py-2 px-4 text-center">Canal</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <a
                        href={`/admin/leads/${lead.id}`}
                        className="font-medium hover:underline"
                      >
                        {lead.nombre ?? lead.telefono ?? "Sin nombre"}
                      </a>
                      {lead.telefono && lead.nombre && (
                        <p className="text-xs text-muted-foreground">{lead.telefono}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{lead.pipeline_stage}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">{lead.pipeline_ruta}</Badge>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-amber-600">
                      {lead.dias_inactivo}d
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {lead.secuencia_aplicable.nombre}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CANAL_COLOR[lead.secuencia_aplicable.canal]}`}>
                        {lead.secuencia_aplicable.canal}
                      </span>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                      No hay leads elegibles en este momento
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
