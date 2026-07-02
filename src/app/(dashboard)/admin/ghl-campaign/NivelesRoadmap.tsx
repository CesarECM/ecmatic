"use client";

import { useState } from "react";
import { UMBRAL_AUTO_FIJO, UMBRAL_BORDERLINE, TRUST_NIVEL4 } from "@/lib/ghl/trust-score";

// Anclas de los niveles sobre la escala de trust_score
const NIVEL_ANCLAS = [
  { nivel: 0, ts: 0.00, label: "N0" },
  { nivel: 1, ts: 0.30, label: "N1" },
  { nivel: 2, ts: 0.56, label: "N2" },
  { nivel: 3, ts: 0.75, label: "N3" },
  { nivel: 4, ts: 0.86, label: "N4" },
] as const;

const NIVEL_NOMBRES = ["Inicio", "Rodaje", "Confianza media", "Alta confianza", "Plena confianza"] as const;

interface Props {
  nivelActual: 0 | 1 | 2 | 3 | 4;
  trustScore: number;
  decisionsWindow: number[];
  windowSize: number;
  lastDecisionAt: string | null;
  automatizado: boolean;
  // analítica (no controlan el nivel)
  aprobadosTotal: number;
  tasaLimpia: number;
}

export function NivelesRoadmap({
  nivelActual, trustScore, decisionsWindow, windowSize,
  lastDecisionAt, automatizado, aprobadosTotal, tasaLimpia,
}: Props) {
  const [abierto, setAbierto] = useState(false);

  const pct          = Math.round(trustScore * 100);
  const windowFill   = decisionsWindow.length;
  const umbralN4pct  = Math.round(TRUST_NIVEL4 * 100);
  const siguienteTs  = nivelActual < 4 ? NIVEL_ANCLAS[nivelActual + 1].ts : null;
  const progHacia    = siguienteTs ? Math.min(100, Math.round((trustScore / siguienteTs) * 100)) : 100;

  // Días sin decisión (para mostrar advertencia de decay)
  const diasSinDecision = lastDecisionAt
    ? Math.floor((Date.now() - new Date(lastDecisionAt).getTime()) / 86_400_000)
    : null;
  const enGrace = diasSinDecision !== null && diasSinDecision >= 3;

  return (
    <div className="rounded-lg border bg-card">
      {/* Cabecera */}
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold">Confianza bayesiana</h2>
          <NivelBadge nivel={nivelActual} automatizado={automatizado} />
          {enGrace && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              ⚠ Decay activo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
            Trust: {pct}% · {windowFill}/{windowSize} decisiones · {Math.round(tasaLimpia * 100)}% histórico
          </span>
          <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
        </div>
      </button>

      {abierto && (
        <div className="px-5 pb-5 space-y-5 border-t pt-4">

          {/* ── Gauge continuo ─────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Trust Score</span>
              <span className="font-semibold tabular-nums text-foreground">{trustScore.toFixed(3)}</span>
            </div>

            {/* Barra con marcadores de nivel */}
            <div className="relative">
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all ${
                    nivelActual >= 4 ? "bg-emerald-500" :
                    nivelActual >= 3 ? "bg-green-500"   :
                    nivelActual >= 2 ? "bg-blue-500"    :
                    nivelActual >= 1 ? "bg-yellow-500"  : "bg-muted-foreground"
                  }`}
                  style={{ width: `${Math.min(100, trustScore / 0.86 * 100)}%` }}
                />
              </div>
              {/* Marcadores de nivel sobre la barra */}
              <div className="relative h-4 mt-0.5">
                {NIVEL_ANCLAS.slice(1).map(({ nivel, ts, label }) => {
                  const positionPct = Math.min(98, ts / 0.86 * 100);
                  return (
                    <span
                      key={nivel}
                      className="absolute -translate-x-1/2 text-[9px] text-muted-foreground"
                      style={{ left: `${positionPct}%` }}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Progreso hacia el siguiente nivel */}
            {nivelActual < 4 && (
              <p className="text-xs text-muted-foreground">
                {progHacia}% hacia Nivel {nivelActual + 1} — {NIVEL_NOMBRES[nivelActual + 1]}
                {" "}(necesitas trust ≥ {Math.round((siguienteTs ?? 0) * 100)}%)
              </p>
            )}
          </div>

          {/* ── Historial de la ventana ─────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Últimas {windowSize} decisiones
              <span className="text-muted-foreground font-normal"> · {windowFill} registradas</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {/* Posiciones vacías (pendientes de llenar) */}
              {Array.from({ length: windowSize }).map((_, i) => {
                const val = decisionsWindow[decisionsWindow.length - windowSize + i];
                const existe = i >= windowSize - windowFill;
                if (!existe) return (
                  <span key={i} className="w-4 h-4 rounded-sm bg-muted opacity-30" title="Sin datos" />
                );
                const v = decisionsWindow[i - (windowSize - windowFill)];
                return (
                  <span
                    key={i}
                    title={v === 1 ? "Aprobado" : v === 0 ? "Editado" : "Phantom (decay)"}
                    className={`w-4 h-4 rounded-sm text-[8px] flex items-center justify-center font-bold ${
                      v === 1  ? "bg-green-500 text-white" :
                      v === 0  ? "bg-orange-400 text-white" :
                                 "bg-muted text-muted-foreground border border-dashed"
                    }`}
                  >
                    {v === 1 ? "✓" : v === 0 ? "✎" : "·"}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              <span><span className="inline-block w-3 h-3 rounded-sm bg-green-500 mr-1" />Aprobado</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-orange-400 mr-1" />Editado</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-muted border border-dashed mr-1" />Phantom (decay)</span>
            </div>
          </div>

          {/* ── Parámetros operativos actuales ─────────────────────── */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">Parámetros actuales</p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <ParamCard icon="⚡" label="Velocidad" value={formatVelocidad(calcVelocidad(trustScore, automatizado))} />
              <ParamCard icon="🔄" label="Por run (5 min)" value={`~${Math.max(1, Math.round(calcVelocidad(trustScore, automatizado) * 5))} leads`} />
              <ParamCard icon="🎯" label="Auto-aprueba" value={`score > ${Math.round((UMBRAL_AUTO_FIJO + (nivelActual === 4 ? UMBRAL_BORDERLINE : 0)) * 100)}%`} />
            </div>
          </div>

          {/* ── Advertencia decay ───────────────────────────────────── */}
          {enGrace && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
              <p className="font-semibold">⚠ Decay en curso — {diasSinDecision} días sin revisiones humanas</p>
              <p className="text-muted-foreground">
                El sistema inyecta un phantom edit cada 24 h tras {3} días de inactividad.
                Aprueba o edita cualquier mensaje para detener el decay.
              </p>
            </div>
          )}

          {/* ── Umbral de auto-activación N4 ───────────────────────── */}
          {!automatizado && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Umbral auto-activación Nivel 4</span>
                <span className="tabular-nums">{pct}% / {umbralN4pct}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-emerald-500/60 transition-all"
                  style={{ width: `${Math.min(100, Math.round((trustScore / TRUST_NIVEL4) * 100))}%` }}
                />
              </div>
              <p>
                Necesita ventana llena ({windowSize}/{windowSize}) + trust ≥ {umbralN4pct}%
                {windowFill < windowSize && ` · faltan ${windowSize - windowFill} decisiones`}
              </p>
            </div>
          )}

          {/* ── Analítica histórica ─────────────────────────────────── */}
          <div className="flex gap-4 text-xs text-muted-foreground border-t pt-3">
            <span>Total revisados: <strong className="text-foreground">{aprobadosTotal}</strong> aprobados</span>
            <span>Tasa histórica: <strong className="text-foreground">{Math.round(tasaLimpia * 100)}%</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers de velocidad (mirrors de trust-score.ts, sin importar lógica en UI) ──

const ANCLAS_TS        = [0, 0.30, 0.56, 0.75, 0.86];
const ANCLAS_VELOCIDAD = [0.167, 0.667, 1.5, 3.333, 10];

function interp(ts: number, anclas: number[], vals: number[]): number {
  if (ts <= anclas[0]) return vals[0];
  if (ts >= anclas[anclas.length - 1]) return vals[vals.length - 1];
  for (let i = 0; i < anclas.length - 1; i++) {
    if (ts >= anclas[i] && ts <= anclas[i + 1]) {
      const t = (ts - anclas[i]) / (anclas[i + 1] - anclas[i]);
      return vals[i] + t * (vals[i + 1] - vals[i]);
    }
  }
  return vals[vals.length - 1];
}

function calcVelocidad(ts: number, auto: boolean): number {
  return auto ? 10 : interp(ts, ANCLAS_TS, ANCLAS_VELOCIDAD);
}

function formatVelocidad(v: number): string {
  if (v <= 0) return "0 leads/min";
  if (v >= 1) return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} leads/min`;
  return `1 lead / ${(1 / v).toFixed(1)} min`;
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function NivelBadge({ nivel, automatizado }: { nivel: 0|1|2|3|4; automatizado: boolean }) {
  const label = automatizado ? "Nivel 4 — Plena confianza" : `Nivel ${nivel} — ${NIVEL_NOMBRES[nivel]}`;
  const color =
    nivel >= 4 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
    nivel >= 3 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"         :
    nivel >= 2 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"             :
    nivel >= 1 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"     :
                 "bg-muted text-muted-foreground";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function ParamCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="text-center space-y-0.5">
      <p className="text-base">{icon}</p>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-semibold text-xs">{value}</p>
    </div>
  );
}
