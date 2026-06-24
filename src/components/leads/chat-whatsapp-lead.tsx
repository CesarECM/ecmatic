"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { VotoBotones } from "@/components/ui/voto-botones";

type Mensaje = {
  id: string;
  canal: string;
  direccion: string;
  contenido: string;
  intencion_clasificada: string | null;
  interceptado: boolean;
  created_at: string;
};

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
  mensajesIniciales: Mensaje[];
  hayMasIniciales: boolean;
}

export function ChatWhatsAppLead({
  leadId,
  tieneTelefono,
  mensajesIniciales,
  hayMasIniciales,
}: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[]>(mensajesIniciales);
  const [hayMas, setHayMas] = useState(hayMasIniciales);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anclaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anclaRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  const cargarAnteriores = useCallback(async () => {
    if (cargandoAnteriores || !hayMas || !mensajes.length) return;
    const oldest = mensajes[0].created_at;
    setCargandoAnteriores(true);
    setError(null);

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
      // Mantener posición de scroll tras prepender mensajes
      requestAnimationFrame(() => {
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar anteriores");
    } finally {
      setCargandoAnteriores(false);
    }
  }, [cargandoAnteriores, hayMas, mensajes, leadId]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;
    setInput("");
    setError(null);
    setEnviando(true);

    const tempId = `opt-${Date.now()}`;
    const optimista: Mensaje = {
      id: tempId,
      canal: "whatsapp",
      direccion: "saliente",
      contenido: texto,
      intencion_clasificada: null,
      interceptado: false,
      created_at: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, optimista]);
    setTimeout(() => anclaRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: texto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensajes((prev) => prev.filter((m) => m.id !== tempId));
        throw new Error(data.error ?? "Error al enviar");
      }
      setMensajes((prev) => prev.map((m) => (m.id === tempId ? data.mensaje : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Cabecera del panel */}
      <div className="px-4 py-2.5 border-b bg-muted/30 shrink-0 flex items-center gap-2">
        <span className="text-sm font-medium">💬 Conversación WhatsApp</span>
        <span className="text-xs text-muted-foreground">
          {mensajes.length} mensaje{mensajes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Área de mensajes */}
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
                className={`flex items-center gap-1 mt-0.5 px-1 flex-wrap text-[10px] text-muted-foreground ${
                  esSaliente ? "justify-end" : ""
                }`}
              >
                <span>
                  {new Date(m.created_at).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
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
                {esSaliente && !esOptimista && (
                  <VotoBotones mensajeId={m.id} />
                )}
              </div>
            </div>
          );
        })}

        <div ref={anclaRef} />
      </div>

      {error && (
        <p className="text-xs text-red-600 px-4 py-1 shrink-0 border-t bg-red-50">
          {error}
        </p>
      )}

      {/* Input de envío */}
      <div className="border-t p-3 shrink-0">
        {!tieneTelefono ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            Sin teléfono registrado — no se puede enviar por WhatsApp.
          </p>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escribir como admin… (Enter = enviar, Shift+Enter = nueva línea)"
              rows={2}
              className="flex-1 rounded-md border px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={enviando}
            />
            <button
              onClick={enviar}
              disabled={enviando || !input.trim()}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors shrink-0"
            >
              {enviando ? "…" : "Enviar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
