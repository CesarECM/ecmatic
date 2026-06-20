"use client";

import { useState } from "react";
import { EliminarLeadSandbox } from "./eliminar-lead-sandbox";

export interface SesionGuardada {
  sessionId: string;
  inicio: string;
  preview: string;
  total: number;
}

function formatFecha(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}m`;
  if (mins < 1440) return `Hace ${Math.floor(mins / 60)}h`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

interface Props {
  sessionId: string;
  sesiones: SesionGuardada[];
  onNuevaSesion: () => void;
  onCargarSesion: (id: string) => void;
  onEliminarSesion: (id: string) => void;
  cargandoSesion: boolean;
}

export function SesionesSandbox({
  sessionId,
  sesiones,
  onNuevaSesion,
  onCargarSesion,
  onEliminarSesion,
  cargandoSesion,
}: Props) {
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  function handleEliminado() {
    const id = eliminandoId!;
    setEliminandoId(null);
    onEliminarSesion(id);
  }

  return (
    <div className="w-48 shrink-0 border rounded-lg bg-card p-3 flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sesiones</h3>
        <button
          onClick={onNuevaSesion}
          className="text-xs text-muted-foreground border rounded px-2 py-0.5 hover:bg-muted transition-colors"
        >
          + Nueva
        </button>
      </div>

      {eliminandoId ? (
        <EliminarLeadSandbox
          sessionId={eliminandoId}
          onEliminado={handleEliminado}
          onCancelar={() => setEliminandoId(null)}
        />
      ) : sesiones.length === 0 ? (
        <p className="text-xs text-muted-foreground flex-1 flex items-center text-center px-1">
          Se guardan automáticamente al primer mensaje.
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {sesiones.map((s) => (
            <div key={s.sessionId} className="group relative">
              <button
                onClick={() => onCargarSesion(s.sessionId)}
                disabled={cargandoSesion}
                className={`w-full text-left rounded-md px-2 py-2 pr-6 text-xs transition-colors hover:bg-muted disabled:opacity-50 ${
                  s.sessionId === sessionId ? "bg-muted ring-1 ring-primary/40" : ""
                }`}
              >
                <p className="font-medium truncate leading-tight">{s.preview}</p>
                <p className="text-muted-foreground mt-0.5">
                  {s.total} msgs · {formatFecha(s.inicio)}
                </p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEliminandoId(s.sessionId); }}
                title="Eliminar lead de prueba"
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-[11px] leading-none"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
