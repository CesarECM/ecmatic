"use client";

import { useTransition } from "react";
import { toggleCampanaAction, reiniciarNivelesAction } from "./actions";

interface Props {
  activa: boolean;
  pendientes: number;
}

export function CampanaControls({ activa, pendientes }: Props) {
  const [pendingToggle, startToggle]     = useTransition();
  const [pendingReset,  startReset]      = useTransition();

  function handleReinicio() {
    if (!confirm("¿Reiniciar todos los niveles a 0? Esto borra la racha y los contadores de aprobación. Úsalo solo cuando haya cambios importantes en el servicio.")) return;
    startReset(() => void reiniciarNivelesAction());
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={handleReinicio}
          disabled={pendingReset || pendingToggle}
          title="Reinicia racha y contadores a 0. Útil tras cambios importantes en el servicio."
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-all
            ${pendingReset ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {pendingReset ? "Reiniciando…" : "↺ Reinicio de niveles"}
        </button>
        <button
          onClick={() => startToggle(() => void toggleCampanaAction(!activa))}
          disabled={pendingToggle || pendingReset}
          className={`relative inline-flex h-10 w-44 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all
            ${activa ? "bg-green-500 hover:bg-green-600 text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground border"}
            ${pendingToggle ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${activa ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
          {pendingToggle ? "Guardando…" : activa ? "Campaña ACTIVA" : "Campaña INACTIVA"}
        </button>
      </div>
      {pendientes > 0 && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          ⏸ {pendientes} pendiente{pendientes > 1 ? "s" : ""} ·{" "}
          <a href="/admin/aprobaciones" className="underline">Revisar</a>
        </p>
      )}
    </div>
  );
}
