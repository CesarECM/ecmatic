"use client";

import { useState } from "react";
import { SugerenciaKBCard } from "./SugerenciaKBCard";
import { SugerenciaKBFichaModal } from "./SugerenciaKBFichaModal";
import type { SugerenciaItem } from "./ColaSugerenciasSeccion";
import type { RecursoKBResumen } from "./SugerenciaKBCard";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoAplicacion } from "@/services/aplicar-sugerencia-kb";

interface Props {
  items: SugerenciaItem[];
  recursosKB: Record<string, RecursoKBResumen>;
  aplicarAction: (id: string, override?: { titulo: string; contenido: string; razon_edicion?: string }) => Promise<ActionResult<ResultadoAplicacion>>;
  eliminarAction: (id: string, feedback: string) => Promise<ActionResult>;
  previsualizarAction: (id: string) => Promise<ActionResult<{ titulo: string; contenido: string }>>;
}

export function ColaSugerenciasKBSeccion({
  items, recursosKB, aplicarAction, eliminarAction, previsualizarAction,
}: Props) {
  const [itemActivo, setItemActivo] = useState<SugerenciaItem | null>(null);

  if (!items.length) return null;

  return (
    <>
      <section className="space-y-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          Mejoras al KB ({items.length})
          <span className="text-xs text-muted-foreground font-normal">
            — haz clic para ver la ficha y aplicar el cambio
          </span>
        </p>
        <div className="space-y-1.5">
          {items.map((item) => (
            <SugerenciaKBCard
              key={item.id}
              item={item}
              onClick={() => setItemActivo(item)}
            />
          ))}
        </div>
      </section>

      <SugerenciaKBFichaModal
        item={itemActivo}
        recursosKB={recursosKB}
        onClose={() => setItemActivo(null)}
        onAplicar={aplicarAction}
        onEliminar={eliminarAction}
        onPrevisualizar={previsualizarAction}
      />
    </>
  );
}
