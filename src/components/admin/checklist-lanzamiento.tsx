"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WADiagnosticoPanel } from "@/components/admin/wa-diagnostico";

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
  // S27 — WhatsApp número definitivo (+52 vía Twilio/Meta)
  { label: "S27.1 — Número mexicano (+52) adquirido en Twilio (verificar que nunca fue usado en WA)", grupo: "S27 WhatsApp" },
  { label: "S27.2 — Número verificado en Meta: SMS/voz recibido en Twilio y código ingresado en Meta BM", grupo: "S27 WhatsApp" },
  { label: "S27.3 — Alta en Meta Business Manager: app WA Business + número asociado al WABA", grupo: "S27 WhatsApp" },
  { label: "S27.4 — Revisión de mensajería Meta aprobada (esperar 1–5 días hábiles)", grupo: "S27 WhatsApp" },
  { label: "S27.5 — WHATSAPP_PHONE_NUMBER_ID actualizado en Vercel con el nuevo Phone ID", grupo: "S27 WhatsApp" },
  { label: "S27.6 — Prueba extremo a extremo exitosa con el botón de diagnóstico (abajo)", grupo: "S27 WhatsApp" },
  { label: "S27.7 — Landings, anuncios y QR actualizados con el número nuevo (GHL intacto en sus canales)", grupo: "S27 WhatsApp" },
  // Generales
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

      {/* S27.5/S27.6 — Diagnóstico en vivo del número WhatsApp activo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Diagnóstico WhatsApp (número activo)</CardTitle>
        </CardHeader>
        <CardContent>
          <WADiagnosticoPanel />
        </CardContent>
      </Card>
    </div>
  );
}
