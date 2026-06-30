"use client";

// MPS-14 S52 — Sección de sugerencias kb_calidad con aplicación directa al KB.
// Separada de ColaSugerenciasSeccion para mantener responsabilidad única.

import { SugerenciaKBCard, type RecursoKBResumen } from "./SugerenciaKBCard";
import type { SugerenciaItem } from "./ColaSugerenciasSeccion";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoAplicacion } from "@/services/aplicar-sugerencia-kb";

interface Props {
  items: SugerenciaItem[];
  recursosKB: Record<string, RecursoKBResumen>;
  aplicarAction: (id: string, override?: { titulo: string; contenido: string }) => Promise<ActionResult<ResultadoAplicacion>>;
  eliminarAction: (id: string) => Promise<ActionResult>;
}

export function ColaSugerenciasKBSeccion({ items, recursosKB, aplicarAction, eliminarAction }: Props) {
  if (!items.length) return null;

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-green-500" />
        Mejoras al KB ({items.length})
        <span className="text-xs text-muted-foreground font-normal">
          — se aplican directamente al conocimiento de la IA
        </span>
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <SugerenciaKBCard
            key={item.id}
            item={item}
            recursosKB={recursosKB}
            onAplicar={(override) => aplicarAction(item.id, override)}
            onEliminar={() => eliminarAction(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
