"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OportunidadNota } from "@/services/oportunidades";
import { agregarNotaAction, editarNotaAction, eliminarNotaAction } from "@/app/(dashboard)/admin/oportunidades/actions";

interface Props {
  oportunidadId: string;
  leadId: string;
  initialNotas: OportunidadNota[];
  preguntaClave?: string | null;
}

export function NotasHistorial({ oportunidadId, leadId, initialNotas, preguntaClave }: Props) {
  const router    = useRouter();
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const [notas,   setNotas]   = useState<OportunidadNota[]>(initialNotas);
  const [draft,   setDraft]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editDraft,    setEditDraft]    = useState("");
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleAnalysis() {
    if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    analyzeTimer.current = setTimeout(async () => {
      setAnalyzing(true);
      try {
        await fetch("/api/admin/oportunidades/analizar-uno", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId }),
        });
        router.refresh();
      } catch { /* no bloquear */ }
      finally { setAnalyzing(false); }
    }, 3000);
  }

  async function handleAgregar() {
    const texto = draft.trim();
    if (!texto) return;
    setSaving(true);
    try {
      const nueva = await agregarNotaAction(oportunidadId, leadId, texto);
      setNotas((prev) => [nueva, ...prev]);
      setDraft("");
      inputRef.current?.focus();
      scheduleAnalysis();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAgregar();
    }
  }

  function startEdit(nota: OportunidadNota) {
    setEditingId(nota.id);
    setEditDraft(nota.contenido);
  }

  async function handleGuardarEdicion(notaId: string) {
    const texto = editDraft.trim();
    if (!texto) return;
    try {
      await editarNotaAction(notaId, texto);
      setNotas((prev) =>
        prev.map((n) => n.id === notaId ? { ...n, contenido: texto, updated_at: new Date().toISOString() } : n)
      );
      setEditingId(null);
      scheduleAnalysis();
    } catch { /* ignore */ }
  }

  async function handleEliminar(notaId: string) {
    if (!confirm("¿Eliminar esta nota?")) return;
    try {
      await eliminarNotaAction(notaId);
      setNotas((prev) => prev.filter((n) => n.id !== notaId));
      scheduleAnalysis();
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-2">
      {/* ── Pregunta clave IA ── */}
      {preguntaClave && (
        <div className="flex items-start gap-1.5 rounded bg-blue-50 border border-blue-100 px-2.5 py-1.5">
          <span className="text-blue-400 text-[11px] mt-px shrink-0">?</span>
          <p className="text-[11px] text-blue-700 italic leading-snug">{preguntaClave}</p>
        </div>
      )}

      {/* ── Input nueva nota ── */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe una nota y presiona Enter…"
          rows={2}
          disabled={saving}
          className="w-full resize-none rounded border bg-background px-2 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          onClick={() => void handleAgregar()}
          disabled={saving || !draft.trim()}
          className="absolute bottom-1.5 right-1.5 rounded bg-primary px-2 py-0.5 text-[9px] font-medium text-primary-foreground disabled:opacity-40 cursor-pointer"
        >
          {saving ? "…" : "Agregar"}
        </button>
      </div>

      {/* ── Indicador IA ── */}
      {analyzing && (
        <p className="text-[9px] text-muted-foreground">⟳ actualizando score…</p>
      )}

      {/* ── Historial ── */}
      {notas.length > 0 && (
        <ul className="space-y-1.5">
          {notas.map((nota) => (
            <li key={nota.id} className="rounded border bg-muted/30 px-2 py-1.5 text-xs">
              {editingId === nota.id ? (
                <div className="space-y-1">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => void handleGuardarEdicion(nota.id)}
                      className="rounded bg-primary px-2 py-0.5 text-[9px] text-primary-foreground cursor-pointer"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border px-2 py-0.5 text-[9px] text-muted-foreground cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="leading-relaxed whitespace-pre-wrap break-words">{nota.contenido}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {new Date(nota.created_at).toLocaleDateString("es-MX", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 mt-0.5">
                    <button
                      onClick={() => startEdit(nota)}
                      title="Editar"
                      className="text-muted-foreground hover:text-foreground text-[11px] cursor-pointer"
                    >
                      ✏
                    </button>
                    <button
                      onClick={() => void handleEliminar(nota.id)}
                      title="Eliminar"
                      className="text-muted-foreground hover:text-red-500 text-[11px] cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {notas.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">Sin notas aún.</p>
      )}
    </div>
  );
}
