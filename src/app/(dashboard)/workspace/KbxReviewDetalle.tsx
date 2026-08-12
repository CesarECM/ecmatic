"use client";

import { useState } from "react";
import { aprobarKbxItemAction, rechazarKbxItemAction } from "./actions";
import type { V2KbxQueueRow } from "@/lib/supabase/types.v2";

const ACCION_INFO: Record<string, { label: string; cls: string; btnLabel: string }> = {
  eliminar:        { label: "Eliminar",  cls: "bg-red-100 text-red-700",     btnLabel: "Eliminar item" },
  unir:            { label: "Unir",      cls: "bg-amber-100 text-amber-700", btnLabel: "Unir (conservar primero)" },
  separar:         { label: "Separar",   cls: "bg-blue-100 text-blue-700",   btnLabel: "Marcar revisado" },
  marcar_obsoleto: { label: "Obsoleto",  cls: "bg-gray-100 text-gray-600",   btnLabel: "Marcar obsoleto" },
};

interface Props {
  item:   V2KbxQueueRow;
  onDone: () => void;
}

export function KbxReviewDetalle({ item, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const info = ACCION_INFO[item.accion_sugerida] ?? {
    label: item.accion_sugerida, cls: "bg-muted text-muted-foreground", btnLabel: "Aprobar",
  };

  async function handleAprobar() {
    setError(null);
    setLoading(true);
    try {
      await aprobarKbxItemAction(item.id, item.accion_sugerida, item.kb_item_ids);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  async function handleIgnorar() {
    setError(null);
    setLoading(true);
    try {
      await rechazarKbxItemAction(item.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3 text-sm">

      {/* Header con tipo de acción y razón */}
      <div className="bg-card rounded border p-3 text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${info.cls}`}>
            {info.label}
          </span>
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
            Mantenimiento KB
          </span>
        </div>
        {item.razon && <p className="leading-relaxed">{item.razon}</p>}
      </div>

      {/* Items KB afectados */}
      {item.kb_items.map((kb, idx) => (
        <div key={kb.id} className="rounded border bg-background p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {item.accion_sugerida === "unir" && idx === 0 ? "Conservar" : `Item ${idx + 1}`}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              kb.tipo === "FAQ" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
            }`}>
              {kb.tipo}
            </span>
            <span className="text-[10px] text-muted-foreground">{kb.score_confianza}%</span>
          </div>
          <p className="leading-relaxed text-foreground line-clamp-4">{kb.contenido}</p>
        </div>
      ))}

      {/* Acciones */}
      <div className="flex gap-2">
        <button
          onClick={handleAprobar}
          disabled={loading}
          className="flex-1 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : info.btnLabel}
        </button>
        <button
          onClick={handleIgnorar}
          disabled={loading}
          className="px-3 py-1.5 rounded border text-xs hover:bg-muted disabled:opacity-50 transition-colors"
        >
          Ignorar
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
