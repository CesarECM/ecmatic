"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ItemAuto {
  label: string;
  ok: boolean;
  detalle?: string;
}

export interface Seccion {
  titulo: string;
  items: ItemAuto[];
}

interface Props {
  secciones: Seccion[];
  totalAuto: number;
  okAuto: number;
  recursosKB: number;
  vendedoresActivos: number;
}

const MANUALES = [
  { label: "Número WhatsApp verificado en Meta Developer Console", grupo: "WhatsApp" },
  { label: "Webhook Meta apunta a https://ecmatic.vercel.app/api/whatsapp/webhook", grupo: "WhatsApp" },
  { label: "Webhook Stripe registrado en Dashboard de Stripe", grupo: "Pagos" },
  { label: "DNS de ceecm.mx apuntando a Vercel (A/CNAME)", grupo: "Producción" },
  { label: "Aviso de Privacidad publicado y accesible en PRIVACY_URL", grupo: "Legal" },
  { label: "Al menos 1 vendedor con OAuth de Google Calendar activo", grupo: "Agendamiento" },
  { label: "Flujo WA de punta a punta probado (mensaje → respuesta IA)", grupo: "WhatsApp" },
  { label: "Pago de prueba completado en Stripe Test Mode", grupo: "Pagos" },
  { label: "SmartBuilderEC: API documentada y SMARTBUILDER_API_KEY configurada", grupo: "Integración" },
  { label: "Facturama sandbox probado con RFC de prueba", grupo: "Facturación" },
  { label: "Seed de conocimiento cargado (mínimo 10 recursos aprobados)", grupo: "Base de Conocimiento" },
];

function Tick({ ok }: { ok: boolean }) {
  return (
    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
      ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

export function ChecklistLanzamiento({ secciones, okAuto, totalAuto, recursosKB, vendedoresActivos }: Props) {
  const [checkedManuales, setCheckedManuales] = useState<Record<number, boolean>>({});
  const okManuales = Object.values(checkedManuales).filter(Boolean).length;
  const totalManuales = MANUALES.length;
  const totalOk = okAuto + okManuales;
  const total = totalAuto + totalManuales;
  const listo = totalOk === total;

  function toggle(i: number) {
    setCheckedManuales((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  return (
    <div className="space-y-6">
      {/* Header con progreso */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl font-bold">{totalOk}/{total}</span>
            <Badge className={listo ? "bg-green-600" : "bg-yellow-500"}>
              {listo ? "Listo para producción" : "En progreso"}
            </Badge>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${listo ? "bg-green-500" : "bg-yellow-400"}`}
              style={{ width: `${(totalOk / total) * 100}%` }}
            />
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground space-y-0.5">
          <p>{recursosKB} recursos KB aprobados</p>
          <p>{vendedoresActivos} vendedor{vendedoresActivos !== 1 ? "es" : ""} activo{vendedoresActivos !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Checks automáticos */}
      {secciones.map((s) => (
        <Card key={s.titulo}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {s.titulo}
              <span className="text-xs font-normal text-muted-foreground">
                {s.items.filter((i) => i.ok).length}/{s.items.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.items.map((item) => (
              <div key={item.label} className="flex items-start gap-2 text-sm">
                <Tick ok={item.ok} />
                <div className="flex-1 min-w-0">
                  <span className={item.ok ? "" : "text-red-700"}>{item.label}</span>
                  {item.detalle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detalle}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Checks manuales */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Verificación manual
            <span className="text-xs font-normal text-muted-foreground">{okManuales}/{totalManuales}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {MANUALES.map((item, i) => (
            <label key={i} className="flex items-start gap-2 text-sm cursor-pointer group">
              <input
                type="checkbox"
                checked={checkedManuales[i] ?? false}
                onChange={() => toggle(i)}
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className={checkedManuales[i] ? "line-through text-muted-foreground" : ""}>
                  {item.label}
                </span>
                <Badge variant="outline" className="ml-2 text-xs py-0">{item.grupo}</Badge>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
