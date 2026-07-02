"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadInfoTab } from "@/components/leads/lead-info-tab";
import { EmailsInterceptadosCard } from "@/components/leads/emails-interceptados-card";
import { PipelinesLead } from "@/components/leads/pipelines-lead";
import { LeadProtocoloPanel } from "@/components/leads/lead-protocolo-panel";
import { agendarLlamadaAdminAction } from "@/app/(dashboard)/admin/leads/[id]/actions";
import type { EntradaContexto } from "@/lib/supabase/types";
import type { EmailInterceptado } from "@/services/bandeja-email";
import type { LeadProtocolo, ToqueRegistro } from "@/services/lead-protocolo";
import type { LlamadaPendienteProtocolo } from "@/services/llamadas";
import type { SeguimientoLead } from "@/services/seguimiento-lead";

type Lead = {
  id: string; nombre: string | null; telefono: string | null; email: string | null;
  pipeline_stage: string; pipeline_ruta: string; score_salud: number;
  compra_previa: boolean; created_at: string; vendedor_id: string | null;
  metadata: Record<string, unknown> | null;
  privacidad_aceptada: boolean; privacidad_fecha: string | null;
  contexto: string | null; contexto_historial: EntradaContexto[];
  contexto_updated_at: string | null;
  score_salud_historial?: { score: number; timestamp: string }[];
  setter_calificado?: boolean | null;
  setter_razon_descalificacion?: string | null;
  memoria_ia?: string | null;
};
type Vendedor = { id: string; nombre: string; email: string };
type Etapa = { id: string; nombre: string; orden: number };
type Movimiento = {
  id: string; etapa_anterior: string | null; etapa_nueva: string;
  motivo: string | null; movido_por: string; ruta: string | null; created_at: string;
};
type SenalSituacional = {
  id: string; tipo: string; descripcion: string; fragmento: string;
  confianza: number; created_at: string;
};
type PipelineActivo = {
  id: string; ruta: string; etapa_actual: string; fases_cagc: number[]; updated_at: string;
};
type EtapaSimple = { nombre: string; orden: number };

type Tab = "info" | "pipelines" | "seguimiento" | "emails";

interface Props {
  lead: Lead;
  etapas: Etapa[];
  historial: Movimiento[];
  vendedores: Vendedor[];
  senales: SenalSituacional[];
  pipelines: PipelineActivo[];
  etapasPorRuta: Record<string, EtapaSimple[]>;
  emailsInterceptados: EmailInterceptado[];
  leadProtocolo?: (LeadProtocolo & { protocolo_nombre: string }) | null;
  historialToques?: ToqueRegistro[];
  llamadasLead?: LlamadaPendienteProtocolo[];
  eliminarLlamadaAction?: (formData: FormData) => Promise<void>;
  seguimientoActivo?: SeguimientoLead | null;
}

export function LeadInfoPanel({
  lead, etapas, historial, vendedores, senales,
  pipelines, etapasPorRuta, emailsInterceptados,
  leadProtocolo = null, historialToques = [],
  llamadasLead = [], eliminarLlamadaAction,
  seguimientoActivo = null,
}: Props) {
  const [tab, setTab] = useState<Tab>("info");

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Información" },
    { id: "pipelines", label: `Pipelines (${pipelines.length})` },
    { id: "seguimiento", label: `Seguimiento${leadProtocolo || seguimientoActivo ? " ●" : ""}` },
    ...(emailsInterceptados.length > 0
      ? [{ id: "emails" as Tab, label: `Emails (${emailsInterceptados.length})` }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b shrink-0 bg-card overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "info" && (
          <LeadInfoTab lead={lead} etapas={etapas} vendedores={vendedores} senales={senales} />
        )}

        {tab === "pipelines" && (
          <PipelinesLead
            leadId={lead.id}
            pipelines={pipelines}
            etapasPorRuta={etapasPorRuta}
            historial={historial}
          />
        )}

        {tab === "seguimiento" && (
          <div className="p-4 space-y-3">
            {/* Estado del motor de seguimiento IA */}
            {seguimientoActivo ? (
              <Card className="border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Motor IA
                    <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Activo · Nivel {seguimientoActivo.nivel}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Tipo: </span>{seguimientoActivo.tipo}</div>
                  <div>
                    <span className="text-muted-foreground">Próximo: </span>
                    {new Date(seguimientoActivo.proximo_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {seguimientoActivo.campana && (
                    <div><span className="text-muted-foreground">Campaña: </span>{seguimientoActivo.campana}</div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
                Sin seguimiento activo del motor IA.
              </p>
            )}

            {/* Agendar llamada (movido del header) */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Agendar llamada</CardTitle></CardHeader>
              <CardContent>
                <form action={agendarLlamadaAdminAction} className="flex items-center gap-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <select name="objetivo" className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background">
                    <option value="avance">Avance</option>
                    <option value="cierre">Cierre</option>
                  </select>
                  <Button type="submit" size="sm" disabled={!lead.vendedor_id}
                    title={lead.vendedor_id ? undefined : "Asigna un vendedor primero"}>
                    Agendar
                  </Button>
                </form>
                {!lead.vendedor_id && (
                  <p className="text-xs text-muted-foreground mt-1">Asigna un vendedor primero.</p>
                )}
              </CardContent>
            </Card>

            {/* Protocolo y toques */}
            <LeadProtocoloPanel
              leadId={lead.id}
              leadProtocolo={leadProtocolo}
              historial={historialToques}
              llamadas={llamadasLead}
              eliminarLlamadaAction={eliminarLlamadaAction}
            />
          </div>
        )}

        {tab === "emails" && (
          <div className="p-4">
            <EmailsInterceptadosCard emails={emailsInterceptados} />
          </div>
        )}
      </div>
    </div>
  );
}
