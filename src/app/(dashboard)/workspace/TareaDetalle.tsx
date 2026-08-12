"use client";

import { useState } from "react";
import {
  generarContenidoAction,
  aprobarContactPointAction,
  editarContactPointAction,
  rechazarContactPointAction,
  enviarPorGHLAction,
  marcarEnviadoManualAction,
} from "./actions";
import type { V2TaskRow, V2TipoContactPoint } from "@/lib/supabase/types.v2";

type UiEstado =
  | "idle"
  | "generando"
  | "editando"
  | "rechazando"
  | "guardando"
  | "listo_envio"   // aprobado en DB, esperando envío
  | "enviando";     // envío GHL o manual en curso

function scoreColor(n: number) {
  if (n >= 80) return "text-green-600";
  if (n >= 60) return "text-yellow-600";
  return "text-red-500";
}

const TIPO_LABEL: Record<V2TipoContactPoint, string> = {
  whatsapp:     "WhatsApp",
  email:        "Email",
  llamada:      "Llamada",
  videollamada: "Videollamada",
};

interface Props {
  tarea:  V2TaskRow;
  onDone: () => void;
}

export function TareaDetalle({ tarea, onDone }: Props) {
  const meta    = (tarea.metadata ?? {}) as Record<string, string>;
  const razon   = meta.razon_contacto ?? "Sin razonamiento registrado";
  const esWA    = tarea.tipo === "whatsapp";

  const [uiEstado, setUiEstado]       = useState<UiEstado>("idle");
  const [instruccion, setInstruccion] = useState("");
  const [contenido, setContenido]     = useState(tarea.contenido_propuesto ?? "");
  const [confianza, setConfianza]     = useState(tarea.confianza ?? 0);
  const [feedback, setFeedback]       = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [copiado, setCopiado]         = useState(false);

  const esPendiente  = tarea.estado === "pendiente_generacion";
  const esGenerado   = tarea.estado === "generado";
  const enEnvio      = uiEstado === "listo_envio" || uiEstado === "enviando";
  const cargando     = uiEstado === "generando" || uiEstado === "guardando" || uiEstado === "enviando";

  // ── Generar ──────────────────────────────────────────────────────────────
  async function handleGenerar() {
    setError(null);
    setUiEstado("generando");
    try {
      const res = await generarContenidoAction(tarea.id, instruccion || undefined);
      setContenido(res.contenido);
      setConfianza(res.confianza);
      setUiEstado("idle");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar");
      setUiEstado("idle");
    }
  }

  // ── Aprobar → pasa a listo_envio ─────────────────────────────────────────
  async function handleAprobar() {
    setError(null);
    setUiEstado("guardando");
    try {
      await aprobarContactPointAction(tarea.id);
      setUiEstado("listo_envio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar");
      setUiEstado("idle");
    }
  }

  // ── Guardar edición → pasa a listo_envio ─────────────────────────────────
  async function handleGuardarEdicion() {
    if (!feedback.trim()) { setError("El motivo de la edición es obligatorio."); return; }
    setError(null);
    setUiEstado("guardando");
    try {
      await editarContactPointAction(tarea.id, contenido, feedback.trim());
      setUiEstado("listo_envio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      setUiEstado("idle");
    }
  }

  // ── Rechazar ──────────────────────────────────────────────────────────────
  async function handleRechazar() {
    if (!feedback.trim()) { setError("El motivo del rechazo es obligatorio."); return; }
    setError(null);
    setUiEstado("guardando");
    try {
      await rechazarContactPointAction(tarea.id, feedback.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar");
      setUiEstado("idle");
    }
  }

  // ── Enviar por GHL ───────────────────────────────────────────────────────
  async function handleEnviarGHL() {
    setError(null);
    setUiEstado("enviando");
    try {
      await enviarPorGHLAction(tarea.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar. Puedes copiarlo y enviarlo manualmente.");
      setUiEstado("listo_envio");
    }
  }

  // ── Marcar enviado manual ────────────────────────────────────────────────
  async function handleMarcarManual() {
    setError(null);
    setUiEstado("enviando");
    try {
      await marcarEnviadoManualAction(tarea.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al marcar como enviado");
      setUiEstado("listo_envio");
    }
  }

  // ── Copiar al portapapeles ───────────────────────────────────────────────
  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(contenido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // API de portapapeles no disponible — silencioso
    }
  }

  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3 text-sm">

      {/* Razonamiento de la IA */}
      <div className="bg-card rounded border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wide">Análisis IA</p>
        <p>{razon}</p>
      </div>

      {/* ── ESTADO: pendiente_generacion ─────────────────────────────────── */}
      {esPendiente && (
        <div className="space-y-2">
          <textarea
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            placeholder="Instrucción adicional para la IA (opcional)…"
            rows={2}
            disabled={cargando}
            className="w-full text-xs border rounded px-2 py-1.5 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            onClick={handleGenerar}
            disabled={cargando}
            className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {cargando ? "Generando…" : "⚡ Generar mensaje"}
          </button>
        </div>
      )}

      {/* ── ESTADO: generado — sección aprobar/editar ────────────────────── */}
      {esGenerado && !enEnvio && uiEstado !== "rechazando" && (
        <div className="space-y-2">
          {/* Confianza */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Confianza:</span>
            <span className={`text-[11px] font-semibold ${scoreColor(confianza)}`}>
              {confianza}%
            </span>
          </div>

          {/* Contenido editable */}
          <textarea
            value={contenido}
            onChange={(e) => { setContenido(e.target.value); setUiEstado("editando"); }}
            rows={6}
            disabled={cargando}
            className="w-full text-xs border rounded px-2 py-1.5 resize-y bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 font-mono leading-relaxed"
          />

          {/* Feedback obligatorio al editar */}
          {uiEstado === "editando" && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="¿Qué cambiaste y por qué? (obligatorio)"
              rows={2}
              className="w-full text-xs border rounded px-2 py-1.5 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}

          {/* Botones aprobar / rechazar */}
          <div className="flex gap-2">
            {uiEstado !== "editando" ? (
              <>
                <button
                  onClick={handleAprobar}
                  disabled={cargando}
                  className="flex-1 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {cargando ? "…" : "✓ Aprobar"}
                </button>
                <button
                  onClick={() => { setUiEstado("rechazando"); setFeedback(""); }}
                  disabled={cargando}
                  className="px-3 py-1.5 rounded border text-xs text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleGuardarEdicion}
                  disabled={cargando}
                  className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {cargando ? "…" : "Guardar y aprobar"}
                </button>
                <button
                  onClick={() => { setUiEstado("idle"); setContenido(tarea.contenido_propuesto ?? ""); setFeedback(""); }}
                  disabled={cargando}
                  className="px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ESTADO: rechazando ───────────────────────────────────────────── */}
      {uiEstado === "rechazando" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">¿Por qué rechazas este mensaje?</p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Motivo del rechazo (obligatorio)…"
            rows={3}
            autoFocus
            className="w-full text-xs border rounded px-2 py-1.5 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-destructive"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRechazar}
              disabled={cargando}
              className="flex-1 py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {cargando ? "…" : "Confirmar rechazo"}
            </button>
            <button
              onClick={() => { setUiEstado("idle"); setFeedback(""); }}
              disabled={cargando}
              className="px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── ESTADO: listo_envio / enviando ───────────────────────────────── */}
      {enEnvio && (
        <div className="space-y-3">
          {/* Banner de aprobado */}
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-3 py-2">
            <span className="font-semibold">✓ Aprobado</span>
            <span className="text-green-600">— {TIPO_LABEL[tarea.tipo]} listo para enviar</span>
          </div>

          {/* Vista previa del contenido (solo lectura) */}
          <div className="text-xs border rounded px-3 py-2 bg-background text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto font-mono">
            {contenido}
          </div>

          {/* Acciones de envío */}
          <div className="space-y-2">
            {esWA && (
              <button
                onClick={handleEnviarGHL}
                disabled={cargando}
                className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                {uiEstado === "enviando" ? "Enviando…" : "⚡ Enviar por GHL"}
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCopiar}
                disabled={cargando}
                className="flex-1 py-1.5 rounded border text-xs hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {copiado ? "✓ Copiado" : "📋 Copiar contenido"}
              </button>
              <button
                onClick={handleMarcarManual}
                disabled={cargando}
                className="flex-1 py-1.5 rounded border text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {uiEstado === "enviando" ? "…" : esWA ? "Lo envié manualmente" : "✓ Lo envié"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}

    </div>
  );
}
