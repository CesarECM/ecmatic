"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleSecuenciaAction } from "@/app/(dashboard)/admin/nurturing/actions";
import type { Secuencia } from "@/services/nurturing";

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
};

const CANAL_COLOR: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-800",
  email: "bg-blue-100 text-blue-800",
};

interface Props {
  secuencias: Secuencia[];
}

function SecuenciaRow({ secuencia }: { secuencia: Secuencia }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(() => toggleSecuenciaAction(secuencia.id, !secuencia.activo));
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-3 px-4 font-medium text-sm">{secuencia.nombre}</td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CANAL_COLOR[secuencia.canal]}`}>
          {CANAL_LABEL[secuencia.canal]}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {secuencia.etapa_pipeline ?? <span className="italic">Todas</span>}
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {secuencia.ruta ?? <span className="italic">Ambas</span>}
      </td>
      <td className="py-3 px-4 text-sm text-center">{secuencia.dias_sin_respuesta}d</td>
      <td className="py-3 px-4 text-center">
        <Button
          size="sm"
          variant={secuencia.activo ? "default" : "outline"}
          disabled={pending}
          onClick={toggle}
          className="h-7 px-3 text-xs"
        >
          {secuencia.activo ? "Activa" : "Inactiva"}
        </Button>
      </td>
    </tr>
  );
}

export function SecuenciasList({ secuencias }: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Secuencias configuradas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2 px-4 text-left">Nombre</th>
                <th className="py-2 px-4 text-left">Canal</th>
                <th className="py-2 px-4 text-left">Etapa</th>
                <th className="py-2 px-4 text-left">Ruta</th>
                <th className="py-2 px-4 text-center">Días</th>
                <th className="py-2 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {secuencias.map((s) => (
                <SecuenciaRow key={s.id} secuencia={s} />
              ))}
              {secuencias.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                    No hay secuencias configuradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
