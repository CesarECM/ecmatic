"use client";

import { useTransition, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toggleCampanaAction, reiniciarNivelesAction, auditarCoberturaAction } from "./actions";

const REFRESH_INTERVAL_MS = 15_000;

interface Props {
  activa: boolean;
  pendientes: number;
}

export function CampanaControls({ activa, pendientes }: Props) {
  const [pendingToggle,  startToggle]   = useTransition();
  const [pendingReset,   startReset]    = useTransition();
  const [pendingAudit,   startAudit]    = useTransition();
  const [auditMsg,       setAuditMsg]   = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("campana_auto_refresh") === "1";
  });
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function toggleAutoRefresh() {
    setAutoRefresh((v) => {
      const next = !v;
      localStorage.setItem("campana_auto_refresh", next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, router]);

  function handleReinicio() {
    if (!confirm("¿Reiniciar todos los niveles a 0? Esto borra la racha y los contadores de aprobación. Úsalo solo cuando haya cambios importantes en el servicio.")) return;
    startReset(() => void reiniciarNivelesAction());
  }

  function handleAuditarCobertura() {
    setAuditMsg(null);
    startAudit(async () => {
      const r = await auditarCoberturaAction();
      setAuditMsg(`${r.creados} seguimientos creados de ${r.procesados} leads revisados`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleAutoRefresh}
          title={autoRefresh ? "Desactivar auto-actualización cada 15 s" : "Activar auto-actualización cada 15 s"}
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all cursor-pointer
            ${autoRefresh
              ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "text-muted-foreground hover:bg-muted/60"}`}
        >
          <span className={`h-2 w-2 rounded-full ${autoRefresh ? "bg-blue-500 animate-pulse" : "bg-muted-foreground"}`} />
          {autoRefresh ? "Auto 15 s" : "Auto-actualizar"}
        </button>
        <button
          onClick={handleAuditarCobertura}
          disabled={pendingAudit || pendingToggle || pendingReset}
          title="Detecta leads con actividad reciente sin seguimiento activo y asigna el tipo correcto con IA."
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-all
            ${pendingAudit ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {pendingAudit ? "Auditando…" : "Auditar cobertura"}
        </button>
        <button
          onClick={handleReinicio}
          disabled={pendingReset || pendingToggle || pendingAudit}
          title="Reinicia racha y contadores a 0. Útil tras cambios importantes en el servicio."
          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-all
            ${pendingReset ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {pendingReset ? "Reiniciando…" : "↺ Reinicio de niveles"}
        </button>
        <button
          onClick={() => startToggle(() => void toggleCampanaAction(!activa))}
          disabled={pendingToggle || pendingReset}
          className={`relative inline-flex h-10 w-44 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all
            ${activa ? "bg-green-500 hover:bg-green-600 text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground border"}
            ${pendingToggle ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${activa ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
          {pendingToggle ? "Guardando…" : activa ? "Campaña ACTIVA" : "Campaña INACTIVA"}
        </button>
      </div>
      {auditMsg && (
        <p className="text-xs text-green-600 dark:text-green-400">{auditMsg}</p>
      )}
      {pendientes > 0 && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          ⏸ {pendientes} pendiente{pendientes > 1 ? "s" : ""} ·{" "}
          <a href="/admin/aprobaciones" className="underline">Revisar</a>
        </p>
      )}
    </div>
  );
}
