"use client";

// MPS-20 S76.3 — Sección KBI en /admin/aprobaciones.
// Lista kbi_sugerencias pendientes y abre el modal al hacer clic.

import { useState } from "react";
import { KBISugerenciaCard, type KBISugerenciaItem } from "./KBISugerenciaCard";
import { KBISugerenciaModal, type RecursoActual } from "./KBISugerenciaModal";
import type { ActionResult } from "@/lib/safe-action";
import type { ResultadoKBI } from "@/services/kbi/aplicador";

interface Props {
  items: KBISugerenciaItem[];
  recursosActuales: Record<string, RecursoActual>;
  aprobarAction: (id: string, override?: { titulo?: string; contenido?: string }) => Promise<ActionResult<ResultadoKBI>>;
  rechazarAction: (id: string, feedback: string) => Promise<ActionResult>;
}

export function KBISugerenciasSeccion({ items, recursosActuales, aprobarAction, rechazarAction }: Props) {
  const [itemActivo, setItemActivo] = useState<KBISugerenciaItem | null>(null);

  if (!items.length) return null;

  const recursoActual = itemActivo?.recurso_id ? (recursosActuales[itemActivo.recurso_id] ?? null) : null;

  return (
    <>
      <section className="space-y-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-sky-500" />
          KBI — Mejoras aprendidas ({items.length})
          <span className="text-xs text-muted-foreground font-normal">
            — cada aprobación actualiza el KB y su embedding
          </span>
        </p>
        <div className="space-y-1.5">
          {items.map((item) => (
            <KBISugerenciaCard
              key={item.id}
              item={item}
              onClick={() => setItemActivo(item)}
            />
          ))}
        </div>
      </section>

      <KBISugerenciaModal
        item={itemActivo}
        recursoActual={recursoActual}
        onClose={() => setItemActivo(null)}
        onAprobar={aprobarAction}
        onRechazar={rechazarAction}
      />
    </>
  );
}
