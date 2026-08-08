"use client";

import {
  createContext, useContext, useState, useCallback, useRef, type ReactNode,
} from "react";
import type { OportunidadRow } from "@/services/oportunidades";

export interface OportunidadesCallbacks {
  remove: (leadId: string) => void;
  update: (leadId: string, upd: Partial<OportunidadRow>) => void;
  add:    (op: OportunidadRow) => void;
}

export interface WorkspaceCtx {
  selectedLeadId:  string | null;
  selectedOp:      OportunidadRow | null;
  selectLead:      (id: string | null, op: OportunidadRow | null) => void;

  chatRefreshKey:     number;
  triggerChatRefresh: () => void;

  // OportunidadesPane se registra al montar
  setOportunidadesCallbacks: (cb: OportunidadesCallbacks | null) => void;

  // Acciones cross-panel (cualquier pane puede llamarlas)
  closeLeadInPanel:  (leadId: string) => void;
  updateLeadInPanel: (leadId: string, upd: Partial<OportunidadRow>) => void;
  addLeadToPanel:    (op: OportunidadRow) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return ctx;
}

// Versión segura para componentes que pueden existir fuera del workspace
export function useWorkspaceOptional(): WorkspaceCtx | null {
  return useContext(Ctx);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedOp,     setSelectedOp]     = useState<OportunidadRow | null>(null);
  const [chatRefreshKey, setChatRefreshKey]  = useState(0);

  // Ref (no state) para evitar re-renders en toda la tree al registrar callbacks
  const callbacksRef = useRef<OportunidadesCallbacks | null>(null);

  const setOportunidadesCallbacks = useCallback((cb: OportunidadesCallbacks | null) => {
    callbacksRef.current = cb;
  }, []);

  const selectLead = useCallback((id: string | null, op: OportunidadRow | null) => {
    setSelectedLeadId(id);
    setSelectedOp(op);
  }, []);

  const triggerChatRefresh = useCallback(() => {
    setChatRefreshKey((k) => k + 1);
  }, []);

  const closeLeadInPanel = useCallback((leadId: string) => {
    callbacksRef.current?.remove(leadId);
    setSelectedLeadId((prev) => (prev === leadId ? null : prev));
    setSelectedOp((prev)     => (prev?.lead_id === leadId ? null : prev));
  }, []);

  const updateLeadInPanel = useCallback((leadId: string, upd: Partial<OportunidadRow>) => {
    callbacksRef.current?.update(leadId, upd);
    setSelectedOp((prev) => (prev?.lead_id === leadId ? { ...prev, ...upd } : prev));
  }, []);

  const addLeadToPanel = useCallback((op: OportunidadRow) => {
    callbacksRef.current?.add(op);
    setSelectedLeadId(op.lead_id);
    setSelectedOp(op);
  }, []);

  return (
    <Ctx.Provider value={{
      selectedLeadId, selectedOp, selectLead,
      chatRefreshKey, triggerChatRefresh,
      setOportunidadesCallbacks,
      closeLeadInPanel, updateLeadInPanel, addLeadToPanel,
    }}>
      {children}
    </Ctx.Provider>
  );
}
