"use client";

import { useState, useRef, useEffect } from "react";
import { VotoBotones } from "@/components/ui/voto-botones";
import { SesionesSandbox } from "./sesiones-sandbox";
import type { SesionGuardada } from "./sesiones-sandbox";

interface MensajeChat {
  rol: "usuario" | "ia";
  texto: string;
  mensajeId?: string | null;
  meta?: {
    intencion: string;
    faseCAGC: number | null;
    etiquetas: string[];
    handoff: boolean;
  };
}

export function ChatWidget() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [sesiones, setSesiones] = useState<SesionGuardada[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoSesion, setCargandoSesion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sandbox_sesiones");
      if (raw) setSesiones(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  useEffect(() => {
    const firstUser = mensajes.find((m) => m.rol === "usuario");
    if (!firstUser) return;
    setSesiones((prev) => {
      const existing = prev.find((s) => s.sessionId === sessionId);
      const entry: SesionGuardada = {
        sessionId,
        inicio: existing?.inicio ?? new Date().toISOString(),
        preview: firstUser.texto.slice(0, 45),
        total: mensajes.length,
      };
      const next = [entry, ...prev.filter((s) => s.sessionId !== sessionId)].slice(0, 10);
      localStorage.setItem("sandbox_sesiones", JSON.stringify(next));
      return next;
    });
  }, [mensajes, sessionId]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || cargando) return;
    setInput("");
    setError(null);
    setMensajes((prev) => [...prev, { rol: "usuario", texto }]);
    setCargando(true);
    try {
      const res = await fetch("/api/admin/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, mensaje: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setMensajes((prev) => [
        ...prev,
        {
          rol: "ia",
          texto: data.respuesta,
          mensajeId: data.mensajeId ?? null,
          meta: { intencion: data.intencion, faseCAGC: data.faseCAGC, etiquetas: data.etiquetas ?? [], handoff: data.handoff },
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    } finally {
      setCargando(false);
    }
  }

  async function cargarSesion(targetId: string) {
    if (targetId === sessionId || cargandoSesion) return;
    setCargandoSesion(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sandbox?sessionId=${targetId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs: MensajeChat[] = (data.mensajes ?? []).map((m: any) => ({
        rol: m.direccion === "entrante" ? "usuario" : "ia",
        texto: m.contenido,
        mensajeId: m.direccion === "saliente" ? m.id : undefined,
      }));
      setSessionId(targetId);
      setMensajes(msgs);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar sesión");
    } finally {
      setCargandoSesion(false);
    }
  }

  function nuevaSesion() {
    setSessionId(crypto.randomUUID());
    setMensajes([]);
    setInput("");
    setError(null);
  }

  function eliminarSesion(id: string) {
    setSesiones((prev) => {
      const next = prev.filter((s) => s.sessionId !== id);
      localStorage.setItem("sandbox_sesiones", JSON.stringify(next));
      return next;
    });
    if (id === sessionId) nuevaSesion();
  }

  const ultimaMeta = [...mensajes].reverse().find((m) => m.rol === "ia" && m.meta)?.meta;

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 180px)" }}>
      <SesionesSandbox
        sessionId={sessionId}
        sesiones={sesiones}
        onNuevaSesion={nuevaSesion}
        onCargarSesion={cargarSesion}
        onEliminarSesion={eliminarSesion}
        cargandoSesion={cargandoSesion}
      />

      {/* Área de chat */}
      <div className="flex flex-col flex-1 border rounded-lg bg-card overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {mensajes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground pt-10">
              Escribe un mensaje para simular una conversación de WhatsApp.
              <br />
              <span className="text-xs">La IA responde igual que en producción, sin envíos reales.</span>
            </p>
          )}
          {mensajes.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.rol === "usuario" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.rol === "usuario"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}
              >
                {m.texto}
              </div>
              {m.rol === "ia" && m.mensajeId && (
                <div className="mt-0.5 px-1">
                  <VotoBotones mensajeId={m.mensajeId} />
                </div>
              )}
            </div>
          ))}
          {cargando && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-muted-foreground">
                <span className="animate-pulse">Procesando…</span>
              </div>
            </div>
          )}
          {cargandoSesion && (
            <p className="text-center text-xs text-muted-foreground py-2 animate-pulse">Cargando sesión…</p>
          )}
          {error && <p className="text-center text-xs text-red-600 py-1">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="border-t p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Escribe como si fueras un lead de WhatsApp…"
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={cargando || cargandoSesion}
            autoFocus
          />
          <button
            onClick={enviar}
            disabled={cargando || cargandoSesion || !input.trim()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Panel de diagnóstico IA */}
      <div className="w-60 shrink-0 border rounded-lg bg-card p-4 space-y-5 overflow-y-auto">
        <h3 className="text-sm font-semibold">Diagnóstico IA</h3>

        {ultimaMeta ? (
          <>
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Intención</p>
              <p className="text-sm font-medium">{ultimaMeta.intencion.replace(/_/g, " ")}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fase CAGC</p>
              <p className="text-sm font-medium">
                {ultimaMeta.faseCAGC !== null ? `Fase ${ultimaMeta.faseCAGC}` : "No detectada"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Etiquetas</p>
              {ultimaMeta.etiquetas.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {ultimaMeta.etiquetas.map((e) => (
                    <span key={e} className="text-xs bg-muted px-2 py-0.5 rounded-full border">{e}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Ninguna aún</p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Handoff</p>
              <p className={`text-sm font-medium ${ultimaMeta.handoff ? "text-red-600" : "text-green-600"}`}>
                {ultimaMeta.handoff ? "Sí — escalaría a humano" : "No"}
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Los diagnósticos aparecen aquí después de la primera respuesta de esta sesión.
          </p>
        )}

        <div className="pt-2 border-t">
          <p className="text-[11px] text-muted-foreground">
            Sesión: <span className="font-mono">{sessionId.slice(0, 8)}…</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {mensajes.filter((m) => m.rol === "usuario").length} mensajes enviados
          </p>
        </div>
      </div>
    </div>
  );
}
