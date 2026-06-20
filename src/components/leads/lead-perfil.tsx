"use client";

import { useTransition, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moverLeadDesdePerfilAction, asignarVendedorAction, toggleNurturingAction, actualizarDatosB2BAction, emitirFacturaAction, marcarPrivacidadManualAction } from "@/app/(dashboard)/admin/leads/[id]/actions";
import { MensajesLead } from "@/components/leads/mensajes-lead";

type Lead = {
  id: string; nombre: string | null; telefono: string | null; email: string | null;
  pipeline_stage: string; pipeline_ruta: string; temperamento_inferido: string | null;
  score_salud: number; compra_previa: boolean; created_at: string; vendedor_id: string | null;
  metadata: Record<string, unknown> | null;
  privacidad_aceptada: boolean; privacidad_fecha: string | null;
};
type Vendedor = { id: string; nombre: string; email: string };
type Etapa = { id: string; nombre: string; orden: number };
type Movimiento = { id: string; etapa_anterior: string | null; etapa_nueva: string; motivo: string | null; movido_por: string; created_at: string };
type Mensaje = { id: string; canal: string; direccion: string; contenido: string; intencion_clasificada: string | null; created_at: string };

interface LeadPerfilProps {
  lead: Lead;
  etapas: Etapa[];
  historial: Movimiento[];
  mensajes: Mensaje[];
  vendedores: Vendedor[];
}

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-100 text-red-800", I: "bg-yellow-100 text-yellow-800",
  S: "bg-green-100 text-green-800", C: "bg-blue-100 text-blue-800",
};


export function LeadPerfil({ lead, etapas, historial, mensajes, vendedores }: LeadPerfilProps) {
  const scoreColor = lead.score_salud >= 67 ? "text-green-600" : lead.score_salud >= 34 ? "text-yellow-600" : "text-red-600";
  const [facturaPending, startFactura] = useTransition();
  const [facturaMsg, setFacturaMsg] = useState<string | null>(null);
  const rfc = lead.metadata?.rfc as string | undefined;
  const cfdiUuid = lead.metadata?.cfdi_uuid as string | undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <a href="/admin/leads" className="text-muted-foreground hover:text-foreground text-sm mt-1">← Leads</a>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{lead.nombre ?? lead.telefono ?? "Sin nombre"}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge>{lead.pipeline_stage}</Badge>
            <Badge variant="secondary">{lead.pipeline_ruta}</Badge>
            {lead.temperamento_inferido && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DISC_COLORS[lead.temperamento_inferido] ?? ""}`}>
                {lead.temperamento_inferido}
              </span>
            )}
            {lead.compra_previa && <span className="text-xs text-green-600 font-medium">★ Recurrente</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Datos del lead */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.telefono && <div><span className="text-muted-foreground">Teléfono: </span>{lead.telefono}</div>}
            {lead.email && <div><span className="text-muted-foreground">Email: </span>{lead.email}</div>}
            <div className="flex gap-4">
              <div><span className="text-muted-foreground">Score salud: </span><span className={`font-semibold ${scoreColor}`}>{lead.score_salud}</span></div>
            </div>
            <div><span className="text-muted-foreground">Alta: </span>{new Date(lead.created_at).toLocaleDateString("es-MX")}</div>
          </CardContent>
        </Card>

        {/* Mover etapa */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Mover etapa</CardTitle></CardHeader>
          <CardContent>
            <form action={moverLeadDesdePerfilAction} className="flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select name="nuevaEtapa" defaultValue={lead.pipeline_stage} className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background">
                {etapas.map((e) => (
                  <option key={e.id} value={e.nombre}>{e.nombre}</option>
                ))}
              </select>
              <Button type="submit" size="sm">Mover</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Asignar vendedor */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Vendedor asignado</CardTitle></CardHeader>
        <CardContent>
          <form action={asignarVendedorAction} className="flex gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="vendedorId" defaultValue={lead.vendedor_id ?? ""} className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background">
              <option value="">Sin asignar</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre} — {v.email}</option>
              ))}
            </select>
            <Button type="submit" size="sm">Asignar</Button>
          </form>
          {vendedores.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">No hay vendedores registrados aún.</p>
          )}
        </CardContent>
      </Card>

      {/* S12.5 — Datos B2B */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Datos B2B</CardTitle></CardHeader>
        <CardContent>
          <form action={actualizarDatosB2BAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="hidden" name="leadId" value={lead.id} />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Empresa</label>
              <input
                name="empresa"
                defaultValue={(lead.metadata?.empresa as string) ?? ""}
                placeholder="Nombre de la empresa"
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cargo</label>
              <input
                name="cargo"
                defaultValue={(lead.metadata?.cargo as string) ?? ""}
                placeholder="Puesto o cargo"
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tamaño empresa</label>
              <select
                name="tamano_empresa"
                defaultValue={(lead.metadata?.tamano_empresa as string) ?? ""}
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
              >
                <option value="">Sin especificar</option>
                <option value="micro">Micro (1-10)</option>
                <option value="pequeña">Pequeña (11-50)</option>
                <option value="mediana">Mediana (51-250)</option>
                <option value="grande">Grande (250+)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">RFC</label>
              <input
                name="rfc"
                defaultValue={(lead.metadata?.rfc as string) ?? ""}
                placeholder="RFC para facturación"
                className="w-full text-sm border rounded-md px-3 py-1.5 bg-background uppercase"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" size="sm">Guardar datos B2B</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* S12.9 — Estado de privacidad LFPDPPP */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Privacidad LFPDPPP</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          {lead.privacidad_aceptada ? (
            <div className="flex-1 text-sm text-green-700 font-medium">
              Aviso aceptado
              {lead.privacidad_fecha && (
                <span className="text-xs text-muted-foreground ml-2">
                  — {new Date(lead.privacidad_fecha).toLocaleDateString("es-MX")}
                </span>
              )}
            </div>
          ) : (
            <>
              <p className="flex-1 text-sm text-yellow-700">Aviso de privacidad pendiente de aceptación.</p>
              <form action={marcarPrivacidadManualAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <Button type="submit" size="sm" variant="outline">Marcar aceptado</Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {/* S4.6 — Pausa de nurturing */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Nurturing automático</CardTitle></CardHeader>
        <CardContent>
          <form action={toggleNurturingAction} className="flex items-center gap-3">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="pausado" value={lead.metadata?.nurturing_pausado === true ? "true" : "false"} />
            <p className="text-sm text-muted-foreground flex-1">
              {lead.metadata?.nurturing_pausado === true
                ? "Nurturing pausado manualmente para este lead."
                : "Este lead recibe mensajes de seguimiento automáticos."}
            </p>
            <Button type="submit" size="sm" variant={lead.metadata?.nurturing_pausado === true ? "default" : "outline"}>
              {lead.metadata?.nurturing_pausado === true ? "Reanudar" : "Pausar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* S12.6 — Facturación (solo si hay RFC) */}
      {rfc && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Facturación CFDI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cfdiUuid && (
              <p className="text-xs text-green-700 font-medium">Último UUID: {cfdiUuid}</p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startFactura(async () => {
                  const res = await emitirFacturaAction(fd);
                  setFacturaMsg(res.ok ? `Factura emitida: ${res.uuid}` : `Error: ${res.error}`);
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Monto total (con IVA)</label>
                <input name="monto" type="number" min="1" step="0.01" required
                  placeholder="1160.00"
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">CP fiscal del receptor</label>
                <input name="cp_fiscal" defaultValue={(lead.metadata?.cp_fiscal as string) ?? ""}
                  placeholder="00000"
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Descripción del servicio</label>
                <input name="descripcion" defaultValue="Servicio de certificación CONOCER"
                  className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" size="sm" disabled={facturaPending}>
                  {facturaPending ? "Emitiendo..." : "Emitir factura"}
                </Button>
                <span className="text-xs text-muted-foreground">RFC: {rfc}</span>
              </div>
            </form>
            {facturaMsg && (
              <p className={`text-xs font-medium ${facturaMsg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                {facturaMsg}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historial de pipeline */}
      {historial.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Historial de etapas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {historial.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString("es-MX")}
                  </span>
                  <span className="text-muted-foreground">{m.etapa_anterior ?? "—"}</span>
                  <span>→</span>
                  <span className="font-medium">{m.etapa_nueva}</span>
                  <Badge variant="outline" className="text-xs">{m.movido_por}</Badge>
                  {m.motivo && <span className="text-muted-foreground text-xs truncate">{m.motivo}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* S21.1 — Mensajes recientes con votación de calidad */}
      <MensajesLead mensajes={mensajes} />
    </div>
  );
}
