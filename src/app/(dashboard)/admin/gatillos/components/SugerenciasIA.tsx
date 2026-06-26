"use client";

import { useState, useTransition } from "react";
import { sugerirGatillosAction } from "../actions";
import type { TipoGatillo } from "@/lib/supabase/types";

interface Sugerencia { tipo: TipoGatillo; razon: string }

export function SugerenciasIA() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [pending, startTransition] = useTransition();
  const [visto, setVisto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function analizar() {
    setError(null);
    startTransition(async () => {
      const resultado = await sugerirGatillosAction();
      if (resultado.error) { setError(resultado.error); return; }
      setSugerencias(resultado.data ?? []);
      setVisto(true);
    });
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Sugerencias de la IA</p>
          <p className="text-xs text-muted-foreground">Analiza los últimos 50 mensajes de leads</p>
        </div>
        <button
          onClick={analizar}
          disabled={pending}
          className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? "Analizando…" : "Analizar patrones"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {visto && sugerencias.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin evidencia suficiente para sugerir gatillos en este momento.</p>
      )}

      {sugerencias.map((s, i) => (
        <div key={i} className="flex items-start gap-2 rounded bg-white border p-3">
          <span className="text-lg">💡</span>
          <div>
            <p className="text-sm font-medium capitalize">{s.tipo.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground">{s.razon}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
