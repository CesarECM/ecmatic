"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextoLead } from "@/components/leads/contexto-lead";
import { FacturacionCard } from "@/components/leads/facturacion-card";
import { ScoreSaludHistorial } from "@/components/leads/score-salud-historial";
import { EmailsInterceptadosCard } from "@/components/leads/emails-interceptados-card";
import { PipelinesLead } from "@/components/leads/pipelines-lead";
import { LeadProtocoloPanel } from "@/components/leads/lead-protocolo-panel";
import {
  moverLeadDesdePerfilAction,
  asignarVendedorAction,
  toggleNurturingAction,
  actualizarDatosB2BAction,
  marcarPrivacidadManualAction,
} from "@/app/(dashboard)/admin/leads/[id]/actions";
import type { EntradaContexto } from "@/lib/supabase/types";
import type { EmailInterceptado } from "@/services/bandeja-email";
import type { LeadProtocolo, ToqueRegistro } from "@/services/lead-protocolo";
import type { LlamadaPendienteProtocolo } from "@/services/llamadas";

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

const SENAL_COLORS: Record<string, string> = {
  evento: "bg-purple-100 text-purple-800",
  fecha_limite: "bg-red-100 text-red-800",
  tercero: "bg-blue-100 text-blue-800",
  urgencia: "bg-orange-100 text-orange-800",
  situacion_laboral: "bg-yellow-100 text-yellow-800",
  otro: "bg-gray-100 text-gray-800",
};

type Tab = "info" | "pipelines" | "emails" | "protocolo";

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
}

export function LeadInfoPanel({
  lead, etapas, historial, vendedores, senales,
  pipelines, etapasPorRuta, emailsInterceptados,
  leadProtocolo = null, historialToques = [],
  llamadasLead = [], eliminarLlamadaAction,
}: Props) {
  const [tab, setTab] = useState<Tab>("info");
  const rfc = lead.metadata?.rfc as string | undefined;
  const cfdiUuid = lead.metadata?.cfdi_uuid as string | undefined;
  const scoreColor =
    lead.score_salud >= 67 ? "text-green-600"
    : lead.score_salud >= 34 ? "text-yellow-600"
    : "text-red-600";

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Información" },
    { id: "pipelines", label: `Pipelines (${pipelines.length})` },
    { id: "emails", label: `Emails (${emailsInterceptados.length})` },
    { id: "protocolo", label: `Protocolo${leadProtocolo ? " ●" : ""}` },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div className="flex border-b shrink-0 bg-card">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "info" && (
          <div className="space-y-3 p-4">
            {/* Datos básicos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Datos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Nombre: </span>
                  {lead.nombre ?? <span className="text-muted-foreground italic">Sin capturar</span>}</div>
                <div><span className="text-muted-foreground">Teléfono: </span>
                  {lead.telefono ?? <span className="text-muted-foreground italic">Sin capturar</span>}</div>
                <div><span className="text-muted-foreground">Email: </span>
                  {lead.email ?? <span className="text-muted-foreground italic">Sin capturar</span>}</div>
                <div className="flex items-center gap-4">
                  <div><span className="text-muted-foreground">Score: </span>
                    <span className={`font-semibold ${scoreColor}`}>{lead.score_salud}</span></div>
                  {lead.compra_previa && (
                    <span className="text-xs text-green-600 font-medium">★ Recurrente</span>
                  )}
                </div>
                <div><span className="text-muted-foreground">Alta: </span>
                  {new Date(lead.created_at).toLocaleDateString("es-MX")}</div>
              </CardContent>
            </Card>

            {/* Etapa primaria */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Etapa primaria</CardTitle></CardHeader>
              <CardContent>
                <form action={moverLeadDesdePerfilAction} className="flex gap-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <select
                    name="nuevaEtapa"
                    defaultValue={lead.pipeline_stage}
                    className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                  >
                    {etapas.map((e) => (
                      <option key={e.id} value={e.nombre}>{e.nombre}</option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">Mover</Button>
                </form>
              </CardContent>
            </Card>

            {/* Vendedor */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Vendedor asignado</CardTitle></CardHeader>
              <CardContent>
                <form action={asignarVendedorAction} className="flex gap-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <select
                    name="vendedorId"
                    defaultValue={lead.vendedor_id ?? ""}
                    className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                  >
                    <option value="">Sin asignar</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">Asignar</Button>
                </form>
              </CardContent>
            </Card>

            {/* Nurturing */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Nurturing</CardTitle></CardHeader>
              <CardContent>
                <form action={toggleNurturingAction} className="flex items-center gap-3">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="pausado" value={lead.metadata?.nurturing_pausado === true ? "true" : "false"} />
                  <p className="text-sm text-muted-foreground flex-1">
                    {lead.metadata?.nurturing_pausado === true ? "Pausado manualmente." : "Activo."}
                  </p>
                  <Button type="submit" size="sm" variant={lead.metadata?.nurturing_pausado === true ? "default" : "outline"}>
                    {lead.metadata?.nurturing_pausado === true ? "Reanudar" : "Pausar"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contexto IA */}
            <ContextoLead
              leadId={lead.id}
              contexto={lead.contexto}
              historial={lead.contexto_historial ?? []}
              contextoFecha={lead.contexto_updated_at}
            />

            {/* Señales situacionales */}
            {senales.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Señales IA</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {senales.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 text-sm">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${SENAL_COLORS[s.tipo] ?? "bg-gray-100 text-gray-800"}`}>
                        {s.tipo.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p>{s.descripcion}</p>
                        {s.fragmento && (
                          <p className="text-xs text-muted-foreground italic truncate">"{s.fragmento}"</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round(s.confianza * 100)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Cualificación setter */}
            {lead.setter_calificado !== null && lead.setter_calificado !== undefined && (
              <Card className={lead.setter_calificado ? "border-green-300" : "border-red-300"}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Cualificación setter</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {lead.setter_calificado ? (
                    <p className="text-green-700 font-medium">Lead calificado.</p>
                  ) : (
                    <>
                      <p className="text-red-700 font-medium">No calificado.</p>
                      {lead.setter_razon_descalificacion && (
                        <p className="text-muted-foreground mt-1">{lead.setter_razon_descalificacion}</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Score historial */}
            <ScoreSaludHistorial
              historial={lead.score_salud_historial ?? []}
              scoreActual={lead.score_salud}
            />

            {/* B2B */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Datos B2B</CardTitle></CardHeader>
              <CardContent>
                <form action={actualizarDatosB2BAction} className="grid grid-cols-2 gap-2">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input name="empresa" defaultValue={(lead.metadata?.empresa as string) ?? ""} placeholder="Empresa" className="text-sm border rounded-md px-3 py-1.5 bg-background" />
                  <input name="cargo" defaultValue={(lead.metadata?.cargo as string) ?? ""} placeholder="Cargo" className="text-sm border rounded-md px-3 py-1.5 bg-background" />
                  <input name="rfc" defaultValue={(lead.metadata?.rfc as string) ?? ""} placeholder="RFC" className="text-sm border rounded-md px-3 py-1.5 bg-background uppercase" />
                  <select name="tamano_empresa" defaultValue={(lead.metadata?.tamano_empresa as string) ?? ""} className="text-sm border rounded-md px-2 py-1.5 bg-background">
                    <option value="">Tamaño empresa</option>
                    <option value="micro">Micro (1-10)</option>
                    <option value="pequeña">Pequeña (11-50)</option>
                    <option value="mediana">Mediana (51-250)</option>
                    <option value="grande">Grande (250+)</option>
                  </select>
                  <div className="col-span-2 flex justify-end">
                    <Button type="submit" size="sm">Guardar B2B</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Privacidad */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Privacidad LFPDPPP</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-3">
                {lead.privacidad_aceptada ? (
                  <p className="text-sm text-green-700 font-medium flex-1">
                    Aceptado{lead.privacidad_fecha && <span className="text-xs text-muted-foreground ml-2">— {new Date(lead.privacidad_fecha).toLocaleDateString("es-MX")}</span>}
                  </p>
                ) : (
                  <>
                    <p className="flex-1 text-sm text-yellow-700">Pendiente.</p>
                    <form action={marcarPrivacidadManualAction}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <Button type="submit" size="sm" variant="outline">Marcar aceptado</Button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Facturación */}
            {rfc && (
              <FacturacionCard
                leadId={lead.id}
                rfc={rfc}
                cfdiUuid={cfdiUuid}
                cpFiscal={(lead.metadata?.cp_fiscal as string) ?? ""}
              />
            )}
          </div>
        )}

        {tab === "pipelines" && (
          <PipelinesLead
            leadId={lead.id}
            pipelines={pipelines}
            etapasPorRuta={etapasPorRuta}
            historial={historial}
          />
        )}

        {tab === "emails" && (
          <div className="p-4">
            {emailsInterceptados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Sin emails registrados para este lead.
              </p>
            ) : (
              <EmailsInterceptadosCard emails={emailsInterceptados} />
            )}
          </div>
        )}

        {tab === "protocolo" && (
          <LeadProtocoloPanel
            leadId={lead.id}
            leadProtocolo={leadProtocolo}
            historial={historialToques}
            llamadas={llamadasLead}
            eliminarLlamadaAction={eliminarLlamadaAction}
          />
        )}
      </div>
    </div>
  );
}
