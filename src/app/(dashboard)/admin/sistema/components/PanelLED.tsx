"use client";

import { useState, useEffect } from "react";
import type { IndicadorSalud, EstadoSalud } from "@/services/health";

const COLOR: Record<EstadoSalud, string> = {
  ok:       "bg-green-500",
  degraded: "bg-yellow-400",
  error:    "bg-red-500",
};

const LABEL: Record<EstadoSalud, string> = {
  ok: "OK", degraded: "Degradado", error: "Error",
};

function Led({ indicador }: { indicador: IndicadorSalud }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span className={`w-3 h-3 rounded-full shrink-0 ${COLOR[indicador.estado]} ${indicador.estado === "error" ? "animate-pulse" : ""}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{indicador.nombre}</p>
        <p className="text-xs text-muted-foreground truncate">{indicador.mensaje}</p>
      </div>
      <span className={`text-xs font-medium shrink-0 ${indicador.estado === "ok" ? "text-green-600" : indicador.estado === "degraded" ? "text-yellow-600" : "text-red-600"}`}>
        {LABEL[indicador.estado]}
      </span>
    </div>
  );
}

export function PanelLED({ inicial }: { inicial: IndicadorSalud[] }) {
  const [indicadores, setIndicadores] = useState<IndicadorSalud[]>(inicial);
  const [ultimoCheck, setUltimoCheck] = useState<string>(new Date().toISOString());

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/health");
        const data = await res.json() as { indicadores: IndicadorSalud[]; ts: string };
        setIndicadores(data.indicadores);
        setUltimoCheck(data.ts);
      } catch { /* mantener estado anterior */ }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const ok = indicadores.filter((i) => i.estado === "ok").length;
  const total = indicadores.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {ok}/{total} integraciones operativas
        </p>
        <p className="text-xs text-muted-foreground">
          Último check: {new Date(ultimoCheck).toLocaleTimeString("es-MX")} · actualiza cada 60s
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {indicadores.map((ind) => <Led key={ind.nombre} indicador={ind} />)}
      </div>
    </div>
  );
}
