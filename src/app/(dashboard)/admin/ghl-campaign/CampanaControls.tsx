"use client";

import { useTransition } from "react";
import { toggleCampanaAction } from "./actions";

interface Props {
  activa: boolean;
  pendientes: number;
}

export function CampanaControls({ activa, pendientes }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => startTransition(() => void toggleCampanaAction(!activa))}
        disabled={pending}
        className={`relative inline-flex h-10 w-44 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all
          ${activa ? "bg-green-500 hover:bg-green-600 text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground border"}
          ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${activa ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
        {pending ? "Guardando…" : activa ? "Campaña ACTIVA" : "Campaña INACTIVA"}
      </button>
      {activa && pendientes > 0 && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          ⏸ {pendientes} pendiente{pendientes > 1 ? "s" : ""} ·{" "}
          <a href="/admin/aprobaciones" className="underline">Revisar</a>
        </p>
      )}
    </div>
  );
}
