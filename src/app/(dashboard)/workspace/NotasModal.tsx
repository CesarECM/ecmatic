"use client";

import { useState, useEffect, useRef } from "react";
import { listarNotasAction, agregarNotaAction } from "./actions";
import type { V2OpportunityNote } from "@/lib/supabase/types.v2";

type NotaRow = Pick<V2OpportunityNote, "id" | "contenido" | "created_at">;

interface Props {
  opId:     string;
  opNombre: string;
  onClose:  () => void;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function NotasModal({ opId, opNombre, onClose }: Props) {
  const [notas, setNotas]         = useState<NotaRow[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [texto, setTexto]         = useState("");
  const [guardando, setGuardando] = useState(false);
  const [reanaliz, setReanaliz]   = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listarNotasAction(opId)
      .then(setNotas)
      .finally(() => {
        setCargando(false);
        textareaRef.current?.focus();
      });
  }, [opId]);

  async function handleAgregar() {
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    try {
      await agregarNotaAction(opId, texto);
      setTexto("");
      setReanaliz(true);
      const fresh = await listarNotasAction(opId);
      setNotas(fresh);
      setTimeout(() => setReanaliz(false), 5000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{opNombre}</p>
            <p className="text-[11px] text-muted-foreground">Notas de la oportunidad</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 shrink-0 text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Lista de notas */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {cargando ? (
            <p className="text-xs text-muted-foreground">Cargando...</p>
          ) : notas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin notas aún. Agrega la primera.</p>
          ) : (
            notas.map((n) => (
              <div key={n.id} className="rounded border p-2.5 bg-muted/30">
                <p className="text-sm whitespace-pre-wrap">{n.contenido}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatFecha(n.created_at)}</p>
              </div>
            ))
          )}
        </div>

        {/* Indicador re-análisis */}
        {reanaliz && (
          <div className="px-4 py-1.5 border-t bg-sky-50 shrink-0">
            <p className="text-[11px] text-sky-600">⚡ Re-analizando oportunidad en background…</p>
          </div>
        )}

        {/* Form */}
        <div className="px-4 py-3 border-t shrink-0 space-y-2">
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAgregar();
            }}
            placeholder="Escribe una nota… (Ctrl+Enter para guardar)"
            className="w-full resize-none rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            disabled={guardando}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border text-muted-foreground hover:text-foreground transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleAgregar}
              disabled={!texto.trim() || guardando}
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {guardando ? "Guardando…" : "Agregar nota"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
