const NIVELES = [
  { nivel: 0, nombre: "Inicio",          lote: 10,  intervalo: 60, umbral: 1.0,  condicion: null },
  { nivel: 1, nombre: "Rodaje",          lote: 20,  intervalo: 30, umbral: 0.95, condicion: { aprobados: 10, tasa: 0.70 } },
  { nivel: 2, nombre: "Confianza media", lote: 30,  intervalo: 20, umbral: 0.90, condicion: { aprobados: 25, tasa: 0.80 } },
  { nivel: 3, nombre: "Alta confianza",  lote: 50,  intervalo: 15, umbral: 0.85, condicion: { aprobados: 50, tasa: 0.90 } },
  { nivel: 4, nombre: "Plena confianza", lote: 100, intervalo: 10, umbral: 0.75, condicion: "manual" as const },
] as const;

interface Props {
  nivelActual: number;
  aprobados: number;
  tasaLimpia: number;
  automatizado: boolean;
}

export function NivelesRoadmap({ nivelActual, aprobados, tasaLimpia, automatizado }: Props) {
  const siguienteNivel = nivelActual < 4 ? nivelActual + 1 : null;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Hoja de ruta — Niveles de confianza</h2>
        <span className="text-xs text-muted-foreground">Progreso actual: {aprobados} aprobados · {Math.round(tasaLimpia * 100)}% tasa limpia</span>
      </div>

      <div className="space-y-2">
        {NIVELES.map((cfg) => {
          const esActual  = cfg.nivel === nivelActual;
          const esPasado  = cfg.nivel < nivelActual;
          const esSiguiente = cfg.nivel === siguienteNivel;

          // Calcular si se cumplen los objetivos y el progreso
          let cumpleObjetivos = esPasado;
          let progreso: { aprobadosOk: boolean; tasaOk: boolean } | null = null;

          if (cfg.condicion === "manual") {
            cumpleObjetivos = automatizado;
          } else if (cfg.condicion && (esSiguiente || esActual)) {
            const aprobadosOk = aprobados >= cfg.condicion.aprobados;
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

                {/* Métricas del nivel */}
                <div className="flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
                  <span title="Tamaño de lote">📦 {cfg.lote}</span>
                  <span title="Intervalo entre lotes">⏱ {cfg.intervalo} min</span>
                  <span title="Umbral para auto-envío" className="font-medium">
                    🎯 {cfg.umbral === 1.0 ? "todo a cola" : `≥ ${Math.round(cfg.umbral * 100)}%`}
                  </span>
                </div>
              </div>

              {/* Objetivos para llegar a este nivel */}
              {cfg.condicion && cfg.nivel > 0 && (
                <div className="mt-2 ml-5 space-y-1">
                  {cfg.condicion === "manual" ? (
                    <p className={automatizado ? "text-green-500" : "text-muted-foreground"}>
                      {automatizado ? "✓" : "○"} Activación manual por admin
                    </p>
                  ) : (
                    <>
                      <ObjFila
                        cumple={esPasado || (!!progreso && progreso.aprobadosOk)}
                        texto={`${cfg.condicion.aprobados}+ mensajes aprobados`}
                        actual={esSiguiente ? `${aprobados} actuales` : null}
                        falta={esSiguiente && !progreso?.aprobadosOk ? cfg.condicion.aprobados - aprobados : null}
                      />
                      <ObjFila
                        cumple={esPasado || (!!progreso && progreso.tasaOk)}
                        texto={`${Math.round(cfg.condicion.tasa * 100)}%+ tasa de aprobación limpia`}
                        actual={esSiguiente ? `${Math.round(tasaLimpia * 100)}% actual` : null}
                        falta={null}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
