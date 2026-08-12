"use client";

import { useState } from "react";
import { aprobarKbItemAction, rechazarKbItemAction, editarKbItemAction } from "./actions";
import type { V2KbItem } from "@/lib/supabase/types.v2";

type UiEstado = "idle" | "editando" | "guardando";

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  FAQ: { label: "FAQ", cls: "bg-blue-100 text-blue-700" },
  IC:  { label: "IC",  cls: "bg-violet-100 text-violet-700" },
};

interface Props {
  item:   V2KbItem;
  onDone: () => void;
}

export function KbItemDetalle({ item, onDone }: Props) {
  const meta  = (item.metadata ?? {}) as Record<string, string>;
  const razon = meta.razon ?? "";

  const [uiEstado, setUiEstado]     = useState<UiEstado>("idle");
  const [contenido, setContenido]   = useState(item.contenido);
  const [error, setError]           = useState<string | null>(null);

  const badge   = TIPO_BADGE[item.tipo] ?? { label: item.tipo, cls: "bg-muted text-muted-foreground" };
  const cargando = uiEstado === "guardando";

  async function handleAprobar() {
    setError(null);
    setUiEstado("guardando");
    try {
      if (uiEstado === "editando" || contenido !== item.contenido) {
        await editarKbItemAction(item.id, contenido);
      } else {
        await aprobarKbItemAction(item.id);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar");
      setUiEstado("idle");
    }
  }

  async function handleRechazar() {
    setError(null);
    setUiEstado("guardando");
    try {
      await rechazarKbItemAction(item.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar");
      setUiEstado("idle");
    }
  }

  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3 text-sm">

      {/* Tipo + razón de la propuesta */}
      <div className="bg-card rounded border p-3 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
            Propuesta KB de la IA
          </span>
        </div>
        {razon && <p className="leading-relaxed">{razon}</p>}
      </div>

      {/* Contenido editable */}
      <textarea
        value={contenido}
        onChange={(e) => { setContenido(e.target.value); setUiEstado("editando"); }}
        rows={4}
        disabled={cargando}
        className="w-full text-xs border rounded px-2 py-1.5 resize-y bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 leading-relaxed"
      />
      {uiEstado === "editando" && (
        <p className="text-[10px] text-muted-foreground">
          Editando — el item se aprobará con el contenido modificado.
        </p>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        <button
          onClick={handleAprobar}
          disabled={cargando}
          className="flex-1 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {cargando ? "…" : uiEstado === "editando" ? "Guardar y aprobar" : "✓ Aprobar"}
        </button>
        {uiEstado === "editando" ? (
          <button
            onClick={() => { setContenido(item.contenido); setUiEstado("idle"); }}
            disabled={cargando}
            className="px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        ) : (
          <button
            onClick={handleRechazar}
            disabled={cargando}
            className="px-3 py-1.5 rounded border text-xs text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}
