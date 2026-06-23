"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Brochure {
  id: string;
  titulo: string;
  url: string;
  activo: boolean;
  fases_cagc_objetivo?: number[];
}

interface Props { servicioId: string; brochures: Brochure[] }

export function BrochuresCard({ servicioId, brochures }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Brochures vinculados</CardTitle>
          <Link href="/admin/conocimiento" className="text-xs text-primary hover:underline">
            Gestionar brochures →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {brochures.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin brochures. El auditor IA detectará cuando falten materiales para este servicio.
          </p>
        ) : (
          brochures.map((b) => (
            <div key={b.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${!b.activo ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium">{b.titulo}</span>
                {b.fases_cagc_objetivo?.length ? (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Fases {b.fases_cagc_objetivo.join(",")}
                  </Badge>
                ) : null}
                {!b.activo && <Badge variant="outline" className="text-[10px] shrink-0">Inactivo</Badge>}
              </div>
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline shrink-0 ml-2"
              >
                Ver PDF
              </a>
            </div>
          ))
        )}
        <p className="text-[10px] text-muted-foreground pt-1">
          Los brochures se vinculan automáticamente al crear o editar un brochure con{" "}
          <code className="font-mono">servicio_id = {servicioId.slice(0, 8)}…</code>
        </p>
      </CardContent>
    </Card>
  );
}
