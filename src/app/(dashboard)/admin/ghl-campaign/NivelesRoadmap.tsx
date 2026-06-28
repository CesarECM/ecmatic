"use client";

import { useState } from "react";

const NIVELES = [
  { nivel: 0, nombre: "Inicio",          lote: 10,  intervalo: 60, umbral: 1.0,  condicion: null },
  { nivel: 1, nombre: "Rodaje",          lote: 20,  intervalo: 30, umbral: 0.95, condicion: { aprobados: 10, tasa: 0.70 } },
  { nivel: 2, nombre: "Confianza media", lote: 30,  intervalo: 20, umbral: 0.90, condicion: { aprobados: 25, tasa: 0.80 } },
  { nivel: 3, nombre: "Alta confianza",  lote: 50,  intervalo: 15, umbral: 0.85, condicion: { aprobados: 50, tasa: 0.90 } },
  { nivel: 4, nombre: "Plena confianza", lote: 100, intervalo: 10, umbral: 0.75, condicion: "manual" as const },
] as const;

interface Props {
  nivelActual: number;
  aprobadosConsecutivos: number;
  aprobadosTotal: number;
  tasaLimpia: number;
  automatizado: boolean;
}

export function NivelesRoadmap({ nivelActual, aprobadosConsecutivos, aprobadosTotal, tasaLimpia, automatizado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const siguienteNivel = nivelActual < 4 ? nivelActual + 1 : null;

  return (
    <div className="rounded-lg border bg-card">
      {/* Cabecera siempre visible — clic para expandir/colapsar */}
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold">Hoja de ruta — Niveles de confianza</h2>
          <RachaBadge consecutivos={aprobadosConsecutivos} nivelActual={nivelActual} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Racha: {aprobadosConsecutivos} · Total: {aprobadosTotal} aprobados · {Math.round(tasaLimpia * 100)}% tasa
          </span>
          <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && (
        <div className="px-5 pb-5 space-y-2 border-t pt-4">
          {NIVELES.map((cfg) => {
            const esActual    = cfg.nivel === nivelActual;
            const esPasado    = cfg.nivel < nivelActual;
            const esSiguiente = cfg.nivel === siguienteNivel;

            let cumpleObjetivos = esPasado;
            let progreso: { aprobadosOk: boolean; tasaOk: boolean } | null = null;

            if (cfg.condicion === "manual") {
              cumpleObjetivos = automatizado;
            } else if (cfg.condicion && (esSiguiente || esActual)) {
              // Usa la racha (aprobadosConsecutivos) como métrica de progresión
              const aprobadosOk = aprobadosConsecutivos >= cfg.condicion.aprobados;
              const tasaOk      = tasaLimpia >= cfg.condicion.tasa;
              cumpleObjetivos   = aprobadosOk && tasaOk;
              if (esSiguiente) progreso = { aprobadosOk, tasaOk };
            }

            return (
              <div
                key={cfg.nivel}
                className={`rounded-lg border p-3 text-xs transition-all ${
                  esActual  ? "border-primary/60 bg-primary/5 shadow-sm" :
                  esPasado  ? "border-green-500/30 bg-green-500/5" :
                              "border-border bg-muted/20 opacity-55"
                }`}
              >
                {/* Fila principal */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-base leading-none shrink-0 ${
                      esPasado ? "text-green-500" : esActual ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {esPasado ? "✓" : esActual ? "▶" : "○"}
                    </span>
                    <span className={`font-semibold ${esPasado ? "text-green-600 dark:text-green-400" : ""}`}>
                      Nivel {cfg.nivel} — {cfg.nombre}
                    </span>
                    {esActual && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium text-[10px]">ACTUAL</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
                    <span title="Tamaño de lote">📦 {cfg.lote}</span>
                    <span title="Intervalo entre lotes">⏱ {cfg.intervalo} min</span>
                    <span title="Umbral para auto-envío" className="font-medium">
                      🎯 {cfg.umbral === 1.0 ? "todo a cola" : `≥ ${Math.round(cfg.umbral * 100)}%`}
                    </span>
                  </div>
                </div>

                {/* Progreso hacia el siguiente nivel */}
                {cfg.condicion && cfg.nivel > 0 && (esSiguiente || esActual) && (
                  <div className="mt-2 ml-5 space-y-1">
                    {cfg.condicion === "manual" ? (
                      <p className={automatizado ? "text-green-500" : "text-muted-foreground"}>
                        {automatizado ? "✓" : "○"} Activación manual por admin
                      </p>
                    ) : (
                      <>
                        <ObjFila
                          cumple={esPasado || (!!progreso && progreso.aprobadosOk)}
                          texto={`${cfg.condicion.aprobados}+ aprobaciones consecutivas`}
                          actual={esSiguiente ? `${aprobadosConsecutivos} en racha` : null}
                          falta={esSiguiente && !progreso?.aprobadosOk ? cfg.condicion.aprobados - aprobadosConsecutivos : null}
                        />
                        <ObjFila
                          cumple={esPasado || (!!progreso && progreso.tasaOk)}
                          texto={`${Math.round(cfg.condicion.tasa * 100)}%+ tasa histórica de aprobación`}
                          actual={esSiguiente ? `${Math.round(tasaLimpia * 100)}% actual` : null}
                          falta={null}
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Mini-barra de progreso de racha solo para el nivel siguiente */}
                {esSiguiente && cfg.condicion && cfg.condicion !== "manual" && (
                  <div className="mt-2 ml-5">
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-primary/60 transition-all"
                        style={{ width: `${Math.min(100, Math.round((aprobadosConsecutivos / cfg.condicion.aprobados) * 100))}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {Math.min(100, Math.round((aprobadosConsecutivos / cfg.condicion.aprobados) * 100))}% hacia el umbral de racha
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RachaBadge({ consecutivos, nivelActual }: { consecutivos: number; nivelActual: number }) {
  if (consecutivos === 0) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        Racha: 0
      </span>
    );
  }
  const color =
    nivelActual >= 3 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
    nivelActual >= 2 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
    nivelActual >= 1 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                       "bg-muted text-muted-foreground";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      🔥 Racha: {consecutivos}
    </span>
  );
}

function ObjFila({ cumple, texto, actual, falta }: {
  cumple: boolean;
  texto: string;
  actual: string | null;
  falta: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cumple ? "text-green-500" : "text-muted-foreground"}>{cumple ? "✓" : "○"}</span>
      <span className={cumple ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>{texto}</span>
      {actual && !cumple && (
        <span className="text-yellow-600 dark:text-yellow-400">
          ({actual}{falta !== null ? ` — faltan ${falta}` : ""})
        </span>
      )}
    </div>
  );
}
