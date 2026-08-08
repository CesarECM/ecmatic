"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { ChatWhatsAppLead } from "@/components/leads/chat-whatsapp-lead";
import { OportunidadCard } from "@/components/oportunidades/OportunidadCard";
import type { Mensaje } from "@/components/leads/chat-input";
import type { WaTemplate } from "@/services/wa-templates";
import type { ModoOperacion } from "@/services/sistema";
import type { ItemAprobacionGHL } from "@/services/ghl-aprobacion";

interface ChatData {
  lead:              { id: string; nombre: string | null; telefono: string | null };
  telefonoLead:      string | null;
  mensajesIniciales: Mensaje[];
  hayMasIniciales:   boolean;
  dentro24h:         boolean;
  modoSistema:       ModoOperacion;
  templatesAprobados: WaTemplate[];
  pendienteGHL:      ItemAprobacionGHL | null;
}

export function LeadDetailPane() {
  const {
    selectedLeadId, selectedOp,
    chatRefreshKey,
    closeLeadInPanel, updateLeadInPanel,
  } = useWorkspace();

  const [chatData,    setChatData]    = useState<ChatData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  useEffect(() => {
    if (!selectedLeadId) { setChatData(null); return; }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/admin/workspace/chat/${selectedLeadId}`)
      .then((r) => r.json())
      .then((data: ChatData) => { if (!cancelled) { setChatData(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedLeadId, chatRefreshKey]);

  // Sin lead seleccionado
  if (!selectedLeadId) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Selecciona un lead del panel izquierdo</p>
      </div>
    );
  }

  // Cargando datos del chat
  if (loading && !chatData) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground animate-pulse">Cargando conversación…</p>
      </div>
    );
  }

  const lead = chatData?.lead;
  const telefonoLead = chatData?.telefonoLead ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Chat WhatsApp ─────────────────────────────────────── */}
      <div className="flex-[3] overflow-hidden border-b min-h-0">
        {chatData ? (
          <ChatWhatsAppLead
            leadId={selectedLeadId}
            tieneTelefono={!!telefonoLead}
            telefonoLead={telefonoLead}
            mensajesIniciales={chatData.mensajesIniciales}
            hayMasIniciales={chatData.hayMasIniciales}
            dentro24h={chatData.dentro24h}
            modoSistema={chatData.modoSistema}
            leadNombre={lead?.nombre ?? null}
            templatesAprobados={chatData.templatesAprobados}
            pendienteGHL={chatData.pendienteGHL}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Sin mensajes</p>
          </div>
        )}
      </div>

      {/* ── Ficha de oportunidad ──────────────────────────────── */}
      <div className="flex-[2] overflow-y-auto min-h-0">
        {selectedOp ? (
          <div className="p-3">
            <OportunidadCard
              op={selectedOp}
              posicionLabel={0}
              isUpdating={updatingId === selectedOp.lead_id}
              onRemove={(leadId) => closeLeadInPanel(leadId)}
              onUpdate={(leadId, upd) => updateLeadInPanel(leadId, upd)}
              onStartUpdating={(leadId) => setUpdatingId(leadId)}
              onEndUpdating={() => setUpdatingId(null)}
            />
            <div className="mt-2 flex justify-end">
              <a
                href={`/admin/leads/${selectedLeadId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                Ver perfil completo ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="p-3 text-xs text-muted-foreground italic">
            Este lead no está en el panel de oportunidades.{" "}
            <a href={`/admin/leads/${selectedLeadId}`} target="_blank" rel="noopener noreferrer"
              className="underline hover:text-foreground">
              Ver perfil completo ↗
            </a>
          </div>
        )}
      </div>

    </div>
  );
}
