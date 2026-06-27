"use client";

import { useTransition } from "react";
import { toggleCampanaAction } from "./actions";
import type { NivelCampana } from "@/services/ghl-aprobacion";

interface Props {
  activa: boolean;
  nivel: NivelCampana;
  enviadosHoy: number;
  pendientes: number;
  ultimoLote: string | null;
  umbralAuto: number;
}

const NIVEL_LABELS = [
  "Nivel 0 — Inicio",
  "Nivel 1 — Rodaje",
  "Nivel 2 — Confianza media",
  "Nivel 3 — Alta confianza",
  "Nivel 4 — Plena confianza",
] as const;

const NIVEL_COLORS = ["text-muted-foreground", "text-yellow-500", "text-blue-500", "text-green-500", "text-emerald-500"] as const;

export function CampanaControls({ activa, nivel, enviadosHoy, pendientes, ultimoLote, umbralAuto }: Props) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(() => void toggleCampanaAction(!activa));
  }

  const pctDia = Math.min(100, Math.round((enviadosHoy / 1000) * 100));

  return (
    <div className="flex flex-col gap-4 items-end min-w-[300px]">

      {/* Toggle principal */}
      <button
        onClick={toggle}
        disabled={pending}
        className={`
          relative inline-flex h-10 w-44 items-center justify-center gap-2
          rounded-lg text-sm font-semibold transition-all
          ${activa
            ? "bg-green-500 hover:bg-green-600 text-white"
            : "bg-muted hover:bg-muted/70 text-muted-foreground border"
          }
          ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${activa ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
        {pending ? "Guardando…" : activa ? "Campaña ACTIVA" : "Campaña INACTIVA"}
      </button>

      {/* Banner pausa por pendientes */}
      {activa && pendientes > 0 && (
        <div className="w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
          <span>⏸</span>
          <span>
            Pausada — <strong>{pendientes}</strong> mensaje{pendientes > 1 ? "s" : ""} pendiente{pendientes > 1 ? "s" : ""} de aprobación.{" "}
            <a href="/admin/aprobaciones" className="underline">Revisar</a>
          </span>
        </div>
      )}

      {/* Panel de métricas adaptativas */}
      <div className="w-full rounded-lg border bg-card p-3 space-y-2.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground font-medium">Nivel de confianza</span>
          <span className={`font-bold ${NIVEL_COLORS[nivel.nivel]}`}>{NIVEL_LABELS[nivel.nivel]}</span>
        </div>
        <p className="text-muted-foreground leading-snug">{nivel.descripcion}</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <p className="text-muted-foreground">Lote</p>
            <p className="font-semibold">{nivel.tamanoLote}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Intervalo</p>
            <p className="font-semibold">{nivel.intervaloMin} min</p>
          </div>
          <div>
            <p className="text-muted-foreground">Umbral IA</p>
            <p className="font-semibold">{Math.round(umbralAuto * 100)}%</p>
          </div>
        </div>

        {/* Cap diario */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Enviados hoy</span>
            <span className={enviadosHoy >= 1000 ? "text-red-500 font-bold" : ""}>{enviadosHoy} / 1,000</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${pctDia >= 100 ? "bg-red-500" : pctDia >= 80 ? "bg-yellow-500" : "bg-primary"}`}
              style={{ width: `${pctDia}%` }}
            />
          </div>
        </div>

        {ultimoLote && (
          <p className="text-muted-foreground pt-0.5">
            Último lote: {new Date(ultimoLote).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
      </div>
    </div>
  );
}
