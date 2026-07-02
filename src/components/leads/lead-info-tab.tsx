"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContextoLead } from "@/components/leads/contexto-lead";
import { FacturacionCard } from "@/components/leads/facturacion-card";
import { ScoreSaludHistorial } from "@/components/leads/score-salud-historial";
import {
  moverLeadDesdePerfilAction,
  asignarVendedorAction,
  toggleNurturingAction,
  actualizarDatosB2BAction,
  marcarPrivacidadManualAction,
} from "@/app/(dashboard)/admin/leads/[id]/actions";
import type { EntradaContexto } from "@/lib/supabase/types";

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
type SenalSituacional = {
  id: string; tipo: string; descripcion: string; fragmento: string;
  confianza: number; created_at: string;
};

const SENAL_COLORS: Record<string, string> = {
  evento: "bg-purple-100 text-purple-800",
  fecha_limite: "bg-red-100 text-red-800",
  tercero: "bg-blue-100 text-blue-800",
  urgencia: "bg-orange-100 text-orange-800",
  situacion_laboral: "bg-yellow-100 text-yellow-800",
  otro: "bg-gray-100 text-gray-800",
};

interface Props {
  lead: Lead;
  etapas: Etapa[];
  vendedores: Vendedor[];
  senales: SenalSituacional[];
}

export function LeadInfoTab({ lead, etapas, vendedores, senales }: Props) {
  const [b2bAbierto, setB2bAbierto] = useState(false);
  const rfc = lead.metadata?.rfc as string | undefined;
  const cfdiUuid = lead.metadata?.cfdi_uuid as string | undefined;
  const nurturingPausado = lead.metadata?.nurturing_pausado === true;

  return (
    <div className="space-y-3 p-4">
      {/* Señales IA — arriba porque son lo más accionable */}
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
                <span className="text-xs text-muted-foreground shrink-0">{Math.round(s.confianza * 100)}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Etapa — chips visuales en lugar de select */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Etapa primaria</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {etapas.map((e) => (
              <form key={e.id} action={moverLeadDesdePerfilAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="nuevaEtapa" value={e.nombre} />
                <button
                  type="submit"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    e.nombre === lead.pipeline_stage
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : "bg-background hover:bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {e.nombre}
                </button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Vendedor + nurturing en una sola card */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Asignación</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form action={asignarVendedorAction} className="flex gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="vendedorId" defaultValue={lead.vendedor_id ?? ""}
              className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background">
              <option value="">Sin asignar</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <Button type="submit" size="sm">Asignar</Button>
          </form>
          <form action={toggleNurturingAction} className="flex items-center justify-between text-sm">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="pausado" value={nurturingPausado ? "true" : "false"} />
            <span className="text-muted-foreground">Nurturing: <span className={nurturingPausado ? "text-amber-600" : "text-green-600"}>{nurturingPausado ? "pausado" : "activo"}</span></span>
            <button type="submit" className="text-xs px-2 py-0.5 rounded border hover:bg-muted transition-colors">
              {nurturingPausado ? "Reanudar" : "Pausar"}
            </button>
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

      {/* Memoria IA */}
      {lead.memoria_ia && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Memoria IA</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {lead.memoria_ia}
          </CardContent>
        </Card>
      )}

      {/* Cualificación setter */}
      {lead.setter_calificado !== null && lead.setter_calificado !== undefined && (
        <Card className={lead.setter_calificado ? "border-green-300" : "border-red-300"}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cualificación setter</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {lead.setter_calificado ? (
              <p className="text-green-700 font-medium">Calificado</p>
            ) : (
              <>
                <p className="text-red-700 font-medium">No calificado</p>
                {lead.setter_razon_descalificacion && (
                  <p className="text-muted-foreground mt-1">{lead.setter_razon_descalificacion}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Score historial */}
      <ScoreSaludHistorial historial={lead.score_salud_historial ?? []} scoreActual={lead.score_salud} />

      {/* B2B — colapsable, raramente necesario */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setB2bAbierto((v) => !v)}>
          <CardTitle className="text-sm flex items-center justify-between">
            Datos B2B
            <span className="text-xs text-muted-foreground font-normal">{b2bAbierto ? "▲ cerrar" : "▼ editar"}</span>
          </CardTitle>
        </CardHeader>
        {b2bAbierto && (
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
        )}
      </Card>

      {/* Privacidad — solo si está pendiente */}
      {!lead.privacidad_aceptada && (
        <Card className="border-yellow-300">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Privacidad LFPDPPP</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <p className="flex-1 text-sm text-yellow-700">Pendiente de aceptación.</p>
            <form action={marcarPrivacidadManualAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Button type="submit" size="sm" variant="outline">Marcar aceptado</Button>
            </form>
          </CardContent>
        </Card>
      )}

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
  );
}
