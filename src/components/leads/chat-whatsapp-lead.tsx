"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput, type Mensaje, type MensajesUpdate } from "./chat-input";
import { BannerAprobacionGHL } from "./banner-aprobacion-ghl";
import type { WaTemplate } from "@/services/wa-templates";
import type { ModoOperacion } from "@/services/sistema";
import type { ItemAprobacionGHL } from "@/services/ghl-aprobacion";

const CANAL_LABEL: Record<string, string> = {
  email: "✉️", meet: "📹", interno: "📝",
};

function renderTexto(texto: string): React.ReactNode {
  return texto.split("\n").map((linea, li, arr) => (
    <span key={li}>
      {linea.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/).map((seg, si) => {
        if (seg.startsWith("**") && seg.endsWith("**"))
          return <strong key={si}>{seg.slice(2, -2)}</strong>;
        if (seg.startsWith("*") && seg.endsWith("*"))
          return <em key={si}>{seg.slice(1, -1)}</em>;
        return seg;
      })}
      {li < arr.length - 1 && <br />}
    </span>
  ));
}

interface Props {
  leadId: string;
  tieneTelefono: boolean;
  telefonoLead?: string | null;
  mensajesIniciales: Mensaje[];
  hayMasIniciales: boolean;
  dentro24h: boolean;
  modoSistema: ModoOperacion;
  leadNombre: string | null;
  templatesAprobados: WaTemplate[];
  pendienteGHL?: ItemAprobacionGHL | null;
}

export function ChatWhatsAppLead({
  leadId, tieneTelefono, telefonoLead, mensajesIniciales, hayMasIniciales,
  dentro24h, modoSistema, leadNombre, templatesAprobados, pendienteGHL,
}: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales);
  const [hayMas, setHayMas] = useState(hayMasIniciales);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anclaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anclaRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  const scrollBottom = useCallback(() => {
    setTimeout(() => anclaRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleUpdate = useCallback((u: MensajesUpdate) => {
    switch (u.tipo) {
      case "optimista":
        setMensajes((prev) => [...prev, u.msg]);
        scrollBottom();
        break;
      case "confirmado":
        setMensajes((prev) => prev.map((m) => (m.id === u.tempId ? u.msg : m)));
        break;
      case "error":
        setMensajes((prev) => prev.filter((m) => m.id !== u.tempId));
        break;
      case "simulados":
        setMensajes((prev) => [...prev.filter((m) => m.id !== u.tempId), ...u.mensajes]);
        scrollBottom();
        break;
    }
  }, [scrollBottom]);

  const cargarAnteriores = useCallback(async () => {
    if (cargandoAnteriores || !hayMas || !mensajes.length) return;
    const oldest = mensajes[0].created_at;
    setCargandoAnteriores(true);
    setErrorCarga(null);

    const scrollEl = scrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;

    try {
      const res = await fetch(
        `/api/admin/leads/${leadId}/mensajes?antes=${encodeURIComponent(oldest)}&limite=20`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setMensajes((prev) => [...(data.mensajes as Mensaje[]), ...prev]);
      setHayMas(data.hayMas);
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
      });
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "Error al cargar anteriores");
    } finally {
      setCargandoAnteriores(false);
    }
  }, [cargandoAnteriores, hayMas, mensajes, leadId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Cabecera */}
      <div className="px-4 py-2.5 border-b bg-muted/30 shrink-0 flex items-center gap-2">
        <span className="text-sm font-medium">💬 Conversación WhatsApp</span>
        <span className="text-xs text-muted-foreground">
          {mensajes.length} mensaje{mensajes.length !== 1 ? "s" : ""}
        </span>
        {!dentro24h && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Ventana 24h cerrada
          </span>
        )}
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {hayMas && (
          <div className="flex justify-center pb-2">
            <button
              onClick={cargarAnteriores}
              disabled={cargandoAnteriores}
              className="text-xs text-primary hover:underline disabled:opacity-50 py-1 px-3 rounded-full border bg-background"
            >
              {cargandoAnteriores ? "Cargando…" : "← Cargar mensajes anteriores"}
            </button>
          </div>
        )}

        {mensajes.length === 0 && !hayMas && (
          <p className="text-center text-sm text-muted-foreground pt-12">
            No hay mensajes con este lead aún.
          </p>
        )}

        {mensajes.map((m) => {
          const esSaliente = m.direccion === "saliente";
          const esOptimista = m.id.startsWith("opt-");
          return (
            <div key={m.id} className={`flex flex-col ${esSaliente ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words ${
                  esSaliente
                    ? "bg-green-600 text-white rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                } ${esOptimista ? "opacity-70" : ""}`}
              >
                {renderTexto(m.contenido)}
              </div>
              <div
                className={`flex items-center gap-1 mt-0.5 px-1 flex-wrap text-[10px] text-muted-foreground ${esSaliente ? "justify-end" : ""}`}
              >
                <span>
                  {new Date(m.created_at).toLocaleString("es-MX", {
                    dateStyle: "short", timeStyle: "short",
                  })}
                </span>
                {m.canal !== "whatsapp" && CANAL_LABEL[m.canal] && (
                  <span>{CANAL_LABEL[m.canal]}</span>
                )}
                {m.intencion_clasificada && (
                  <span className="bg-muted px-1.5 py-0.5 rounded">
                    {m.intencion_clasificada.replace(/_/g, " ")}
                  </span>
                )}
                {m.interceptado && (
                  <span className="bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">
                    interceptado
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div ref={anclaRef} />
      </div>

      {errorCarga && (
        <p className="text-xs text-red-600 px-4 py-1 shrink-0 border-t bg-red-50">
          {errorCarga}
        </p>
      )}

      {/* Banner aprobación GHL — max-h para que nunca aplaste el área de mensajes */}
      {pendienteGHL && (
        <div className="shrink-0 overflow-y-auto max-h-[200px]">
          <BannerAprobacionGHL item={pendienteGHL} leadId={leadId} telefonoLead={telefonoLead} />
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3 shrink-0">
        <ChatInput
          leadId={leadId}
          tieneTelefono={tieneTelefono}
          dentro24h={dentro24h}
          modoSistema={modoSistema}
          leadNombre={leadNombre}
          templatesAprobados={templatesAprobados}
          onUpdate={handleUpdate}
        />
      </div>
    </div>
  );
}
