"use client";

import { useState, useCallback } from "react";

interface LoteResultado {
  procesados: number;
  enviados:   number;
  excluidos:  number;
  errores:    number;
  nextPage:   number | null;
  totalGHL:   number;
}

interface Props {
  campana: string;
}

export function CampanaControls({ campana }: Props) {
  const [estado,     setEstado]     = useState<"idle" | "running" | "paused" | "done">("idle");
  const [pagActual,  setPagActual]  = useState(1);
  const [acumStats,  setAcumStats]  = useState({ procesados: 0, enviados: 0, excluidos: 0, errores: 0, total: 0 });
  const [ultimoLog,  setUltimoLog]  = useState<string>("");
  const [pauseFlag,  setPauseFlag]  = useState(false);

  const procesarLote = useCallback(async (page: number, paused: boolean): Promise<void> => {
    if (paused) {
      setEstado("paused");
      return;
    }

    setEstado("running");
    setUltimoLog(`Procesando página ${page}...`);

    let resultado: LoteResultado;
    try {
      const res = await fetch("/api/admin/ghl/campana", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ page, pageLimit: 20 }),
        credentials: "include",
      });
      const data = await res.json() as { ok: boolean; error?: string } & LoteResultado;

      if (!data.ok) {
        setUltimoLog(`Error: ${data.error ?? "Error desconocido"}`);
        setEstado("idle");
        return;
      }
      resultado = data;
    } catch (err) {
      setUltimoLog(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
      setEstado("idle");
      return;
    }

    setAcumStats((prev) => ({
      procesados: prev.procesados + resultado.procesados,
      enviados:   prev.enviados   + resultado.enviados,
      excluidos:  prev.excluidos  + resultado.excluidos,
      errores:    prev.errores    + resultado.errores,
      total:      resultado.totalGHL,
    }));

    setPagActual(resultado.nextPage ?? page);

    setUltimoLog(
      `Pág ${page} — enviados: ${resultado.enviados} · excluidos: ${resultado.excluidos} · errores: ${resultado.errores}`
    );

    if (resultado.nextPage === null) {
      setEstado("done");
      setUltimoLog("Campaña completada.");
      return;
    }

    // Pausa entre lotes para no saturar GHL (20 contactos × 2s = ~40s por lote)
    await new Promise((r) => setTimeout(r, 500));
    await procesarLote(resultado.nextPage, pauseFlag);
  }, [pauseFlag]);

  function iniciar() {
    setPauseFlag(false);
    setAcumStats({ procesados: 0, enviados: 0, excluidos: 0, errores: 0, total: 0 });
    setPagActual(1);
    void procesarLote(1, false);
  }

  function pausar() {
    setPauseFlag(true);
    setEstado("paused");
  }

  function reanudar() {
    setPauseFlag(false);
    void procesarLote(pagActual, false);
  }

  const pct = acumStats.total > 0
    ? Math.round((acumStats.procesados / acumStats.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3 items-end min-w-[280px]">
      {/* Botones de control */}
      <div className="flex gap-2">
        {estado === "idle" && (
          <button
            onClick={iniciar}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Iniciar campaña
          </button>
        )}
        {estado === "running" && (
          <button
            onClick={pausar}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-yellow-500 text-white hover:bg-yellow-600"
          >
            Pausar
          </button>
        )}
        {estado === "paused" && (
          <>
            <button
              onClick={reanudar}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Reanudar (pág {pagActual})
            </button>
            <button
              onClick={() => setEstado("idle")}
              className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted"
            >
              Cancelar
            </button>
          </>
        )}
        {estado === "done" && (
          <button
            onClick={() => setEstado("idle")}
            className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted"
          >
            Nueva campaña
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      {(estado === "running" || estado === "paused") && (
        <div className="w-full space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{acumStats.procesados} / {acumStats.total || "?"} contactos</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="text-green-500">Enviados: {acumStats.enviados}</span>
            <span>Excluidos: {acumStats.excluidos}</span>
            {acumStats.errores > 0 && <span className="text-red-500">Errores: {acumStats.errores}</span>}
          </div>
        </div>
      )}

      {/* Log de estado */}
      {ultimoLog && (
        <p className="text-xs text-muted-foreground max-w-xs text-right">{ultimoLog}</p>
      )}
    </div>
  );
}
