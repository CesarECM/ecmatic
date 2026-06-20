"use client";

import { useEffect, useState } from "react";

interface EstadoLead {
  encontrado: boolean;
  pipeline_stage?: string | null;
  pipeline_ruta?: string | null;
  faseCAGC?: number | null;
  tareaActiva?: { tipo: string; motivo: string | null } | null;
  totalMensajes?: number;
  votosNegativos?: number;
}

interface Props {
  sessionId: string;
  onEliminado: () => void;
  onCancelar: () => void;
}

export function EliminarLeadSandbox({ sessionId, onEliminado, onCancelar }: Props) {
  const [estado, setEstado] = useState<EstadoLead | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/sandbox?sessionId=${sessionId}&estado=1`)
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setError("Error al cargar"))
      .finally(() => setCargando(false));
  }, [sessionId]);

  async function eliminar() {
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/sandbox?sessionId=${sessionId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setExito(true);
      setTimeout(onEliminado, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
      setEliminando(false);
    }
  }

  if (exito) {
    return <p className="text-xs text-green-600 text-center py-4">Lead eliminado ✓</p>;
  }

  return (
    <div className="space-y-3 text-xs flex-1">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">Eliminar lead</p>
        <button onClick={onCancelar} className="text-muted-foreground hover:text-foreground leading-none">✕</button>
      </div>

      {cargando && <p className="text-muted-foreground animate-pulse">Cargando estado…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && estado && (
        estado.encontrado ? (
          <div className="space-y-1.5 bg-muted/50 rounded p-2">
            <Row label="Pipeline" value={estado.pipeline_stage ?? "—"} />
            <Row label="Ruta" value={estado.pipeline_ruta ?? "—"} />
            <Row label="CAGC" value={estado.faseCAGC != null ? `Fase ${estado.faseCAGC}` : "—"} />
            <Row label="Tarea" value={estado.tareaActiva?.tipo ?? "Ninguna"} />
            <Row label="Mensajes" value={String(estado.totalMensajes ?? 0)} />
            {(estado.votosNegativos ?? 0) > 0 && (
              <p className="text-amber-600 text-[11px] pt-1 border-t border-border mt-1">
                {estado.votosNegativos} voto(s) malo(s) preservados
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">Sin datos en la base.</p>
        )
      )}

      <div className="flex gap-1.5">
        <button
          onClick={eliminar}
          disabled={eliminando || cargando}
          className="flex-1 py-1.5 rounded bg-destructive text-destructive-foreground font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {eliminando ? "…" : "Eliminar"}
        </button>
        <button
          onClick={onCancelar}
          disabled={eliminando}
          className="px-3 py-1.5 rounded border hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}
