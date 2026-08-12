"use client";

import {
  createContext, useContext, useState, useCallback, useRef, type ReactNode,
} from "react";

export type RealtimeStatus = "connecting" | "connected" | "error";

interface V2WorkspaceCtx {
  selectedLeadId:          string | null;
  openLead:                (leadId: string) => void;
  closeLead:               () => void;
  realtimeStatus:          RealtimeStatus;
  setRealtimeStatus:       (s: RealtimeStatus) => void;
  // Cada pane registra su propia fn de refresh; WorkspaceClient las llama al recibir Realtime
  setRefreshOportunidades: (fn: (() => void) | null) => void;
  setRefreshTareas:        (fn: (() => void) | null) => void;
  refreshOportunidades:    () => void;
  refreshTareas:           () => void;
}

const Ctx = createContext<V2WorkspaceCtx | null>(null);

export function useV2Workspace(): V2WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useV2Workspace must be inside V2WorkspaceProvider");
  return ctx;
}

export function V2WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");

  // Refs en vez de state para evitar re-renders al registrar callbacks
  const refreshOpRef     = useRef<(() => void) | null>(null);
  const refreshTareasRef = useRef<(() => void) | null>(null);

  const openLead  = useCallback((id: string) => setSelectedLeadId(id), []);
  const closeLead = useCallback(() => setSelectedLeadId(null), []);

  const setRefreshOportunidades = useCallback((fn: (() => void) | null) => {
    refreshOpRef.current = fn;
  }, []);

  const setRefreshTareas = useCallback((fn: (() => void) | null) => {
    refreshTareasRef.current = fn;
  }, []);

  const refreshOportunidades = useCallback(() => refreshOpRef.current?.(),     []);
  const refreshTareas        = useCallback(() => refreshTareasRef.current?.(), []);

  return (
    <Ctx.Provider value={{
      selectedLeadId, openLead, closeLead,
      realtimeStatus, setRealtimeStatus,
      setRefreshOportunidades, setRefreshTareas,
      refreshOportunidades, refreshTareas,
    }}>
      {children}
    </Ctx.Provider>
  );
}
