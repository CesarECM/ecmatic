"use client";

import { useState } from "react";

interface EntradaScore { score: number; timestamp: string }

interface Props { historial: EntradaScore[]; scoreActual: number }

function colorScore(s: number) {
  return s >= 67 ? "text-green-600" : s >= 34 ? "text-yellow-600" : "text-red-600";
}

function MiniBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 67 ? "bg-green-500" : score >= 34 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-8 text-right ${colorScore(score)}`}>{score}</span>
    </div>
  );
}

export function ScoreSaludHistorial({ historial, scoreActual }: Props) {
  const [abierto, setAbierto] = useState(false);
  const ultimas = [...historial].reverse().slice(0, 30);

  return (
    <div className="border rounded-lg bg-card">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span>Historial — Score de salud</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${colorScore(scoreActual)}`}>{scoreActual}/100</span>
          <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {!ultimas.length && (
            <p className="text-xs text-muted-foreground">
              Sin historial aún. El score se registra con cada conversación y en el cron dominical.
            </p>
          )}
          {ultimas.length > 0 && (
            <div className="space-y-1.5">
              {ultimas.map((e, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground w-28 shrink-0">
                    {new Date(e.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <div className="flex-1">
                    <MiniBar score={e.score} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {historial.length > 30 && (
            <p className="text-[10px] text-muted-foreground">(mostrando últimas 30 de {historial.length} entradas)</p>
          )}
        </div>
      )}
    </div>
  );
}
