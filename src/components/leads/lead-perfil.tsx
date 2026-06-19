"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moverLeadDesdePerfilAction, asignarVendedorAction } from "@/app/(dashboard)/admin/leads/[id]/actions";

type Lead = {
  id: string; nombre: string | null; telefono: string | null; email: string | null;
  pipeline_stage: string; pipeline_ruta: string; temperamento_inferido: string | null;
  score_salud: number; compra_previa: boolean; created_at: string; vendedor_id: string | null;
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

const CANAL_ICON: Record<string, string> = {
  whatsapp: "💬", email: "✉️", meet: "📹", interno: "📝",
};

export function LeadPerfil({ lead, etapas, historial, mensajes, vendedores }: LeadPerfilProps) {
  const scoreColor = lead.score_salud >= 67 ? "text-green-600" : lead.score_salud >= 34 ? "text-yellow-600" : "text-red-600";

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

      {/* Mensajes recientes */}
      {mensajes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Mensajes recientes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mensajes.map((m) => (
                <div key={m.id} className={`text-sm p-2 rounded-md ${m.direccion === "entrante" ? "bg-muted" : "bg-primary/5 text-right"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span>{CANAL_ICON[m.canal] ?? "📨"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                    {m.intencion_clasificada && <Badge variant="outline" className="text-xs py-0">{m.intencion_clasificada}</Badge>}
                  </div>
                  <p className="text-sm">{m.contenido}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
