"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { OportunidadCard } from "@/components/oportunidades/OportunidadCard";
import { reordenarAction } from "./actions";
import type { OportunidadRow, OportunidadLista } from "@/services/oportunidades";

interface Props {
  lista: OportunidadLista;
  ultimaIaAt: string | null;
}

const SUGIERE_DOT: Record<string, string> = {
  cerrar_ganado:  "bg-green-500",
  cerrar_perdido: "bg-red-500",
  upsell:         "bg-purple-500",
};

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-green-600" : s >= 40 ? "text-yellow-600" : "text-muted-foreground";

export function OportunidadesClient({ lista, ultimaIaAt }: Props) {
  const router   = useRouter();
  const [items,      setItems]      = useState<OportunidadRow[]>(lista.top10);
  const [selected,   setSelected]   = useState<OportunidadRow | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [msg,        setMsg]        = useState<string | null>(null);
  const [mostrarEspera,      setMostrarEspera]      = useState(true);
  const [mostrarSeguimiento, setMostrarSeguimiento] = useState(false);
  const [, startReorder] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const panelVacio = items.length === 0 && lista.esperando.length === 0 && lista.seguimiento.length === 0;

  const staleHours = ultimaIaAt
    ? Math.floor((Date.now() - new Date(ultimaIaAt).getTime()) / 3_600_000)
    : null;
  const isStale = staleHours === null || staleHours >= 24;

  async function handleAnalizar() {
    setAnalizando(true); setMsg(null);
    try {
      const res  = await fetch("/api/admin/oportunidades/analizar", { method: "POST" });
      const data = await res.json() as { exitosos?: number; errores?: number; agregados?: number };
      setMsg(`${data.exitosos ?? 0} analizados${data.agregados ? `, ${data.agregados} nuevos` : ""}${data.errores ? `, ${data.errores} errores` : ""}`);
      router.refresh();
    } catch { setMsg("Error al analizar. Intenta de nuevo."); }
    finally  { setAnalizando(false); }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx     = items.findIndex((i) => i.id === active.id);
    const newIdx     = items.findIndex((i) => i.id === over.id);
    const reordenado = arrayMove(items, oldIdx, newIdx).map((item, idx) => ({ ...item, posicion: idx }));
    setItems(reordenado);
    startReorder(() =>
      void reordenarAction(reordenado.map(({ id, posicion, lead_id }) => ({ id, posicion, leadId: lead_id })))
    );
  }

  function handleOpenChange(open: boolean) {
    if (!open) { setSelected(null); router.refresh(); }
  }

  const totalPool = lista.top10.length + lista.esperando.length + lista.seguimiento.length;

  return (
    <div className="space-y-4">
      {/* ── Barra IA ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0 text-xs space-y-0.5">
          <div className="text-muted-foreground">
            {totalPool > 0 && (
              <span>{totalPool} en seguimiento · {items.length} en foco</span>
            )}
            {!isStale && staleHours !== null && (
              <span className="ml-2">· IA actualizada hace {staleHours}h</span>
            )}
            {isStale && !panelVacio && (
              <span className="ml-2 text-amber-600 font-medium">· Análisis desactualizado</span>
            )}
          </div>
          {msg && <p className="text-green-600">{msg}</p>}
        </div>
        <button onClick={handleAnalizar} disabled={analizando}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer
            ${isStale || panelVacio ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted/60"}
            ${analizando ? "opacity-50 cursor-not-allowed" : ""}`}>
          {analizando ? <><span className="animate-spin">⟳</span> Analizando…</>
            : panelVacio ? "Inicializar panel con IA" : "⟳ Reanalizar con IA"}
        </button>
      </div>

      {/* ── Estado vacío ─────────────────────────────────── */}
      {panelVacio && !analizando && (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-2">
          <p className="text-lg font-semibold">Panel vacío</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Presiona &ldquo;Inicializar panel con IA&rdquo; para que Claude seleccione las mejores oportunidades de cierre.
          </p>
        </div>
      )}

      {/* ── Top 10 — Lista DnD ───────────────────────────── */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            En foco ({items.length})
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="w-full rounded-xl border overflow-hidden divide-y">
                {items.map((op, idx) => (
                  <SortableRow
                    key={op.id}
                    op={op}
                    posicion={idx + 1}
                    onClick={() => setSelected(op)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* ── En espera (fecha_compromiso futura) ──────────── */}
      {lista.esperando.length > 0 && (
        <div>
          <button
            onClick={() => setMostrarEspera((v) => !v)}
            className="flex items-center gap-2 text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-2 cursor-pointer hover:opacity-70"
          >
            <span>{mostrarEspera ? "▾" : "▸"}</span>
            En espera ({lista.esperando.length})
            <span className="normal-case font-normal text-amber-600">— vuelven al reactivarse</span>
          </button>
          {mostrarEspera && (
            <div className="w-full rounded-xl border border-amber-200 overflow-hidden divide-y divide-amber-100">
              {lista.esperando.map((op, idx) => (
                <EsperandoRow
                  key={op.id}
                  op={op}
                  posicion={idx + 1}
                  onClick={() => setSelected(op)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── En seguimiento (fuera del top 10) ────────────── */}
      {lista.seguimiento.length > 0 && (
        <div>
          <button
            onClick={() => setMostrarSeguimiento((v) => !v)}
            className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 cursor-pointer hover:opacity-70"
          >
            <span>{mostrarSeguimiento ? "▾" : "▸"}</span>
            En seguimiento ({lista.seguimiento.length})
            <span className="normal-case font-normal">— monitoreados, fuera del foco principal</span>
          </button>
          {mostrarSeguimiento && (
            <div className="w-full rounded-xl border overflow-hidden divide-y opacity-75">
              {lista.seguimiento.map((op, idx) => (
                <SimpleRow
                  key={op.id}
                  op={op}
                  posicion={idx + 1}
                  onClick={() => setSelected(op)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal ficha completa ─────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{selected?.leads?.nombre ?? "Oportunidad"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <OportunidadCard
              op={selected}
              posicionLabel={
                items.findIndex((i) => i.id === selected.id) + 1 ||
                lista.esperando.findIndex((i) => i.id === selected.id) + 1 ||
                lista.seguimiento.findIndex((i) => i.id === selected.id) + 1
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Fila DnD (Top 10) ─────────────────────────────────────────────────────────

function SortableRow({ op, posicion, onClick }: {
  op: OportunidadRow; posicion: number; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: op.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex:  isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors group">
      <span {...attributes} {...listeners}
        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground select-none text-base leading-none shrink-0"
        title="Arrastrar">⠿</span>
      <LeadIndicadores op={op} posicion={posicion} onClick={onClick} />
    </div>
  );
}

// ── Fila En Espera (con countdown) ───────────────────────────────────────────

function EsperandoRow({ op, posicion, onClick }: {
  op: OportunidadRow; posicion: number; onClick: () => void;
}) {
  const countdown = op.fecha_compromiso ? calcularCountdown(op.fecha_compromiso) : null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50/40 hover:bg-amber-50 transition-colors">
      <span className="text-xs shrink-0 w-5 text-center text-amber-600 font-bold">{posicion}</span>
      <button onClick={onClick}
        className="flex-1 text-left text-sm font-medium hover:text-primary truncate cursor-pointer">
        {op.leads?.nombre ?? <span className="text-muted-foreground italic">Sin nombre</span>}
      </button>
      {countdown && (
        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 shrink-0">
          {countdown}
        </span>
      )}
      <ScoreChip score={op.score_cierre} />
    </div>
  );
}

// ── Fila simple (Seguimiento pool) ───────────────────────────────────────────

function SimpleRow({ op, posicion, onClick }: {
  op: OportunidadRow; posicion: number; onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors">
      <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{posicion}</span>
      <button onClick={onClick}
        className="flex-1 text-left text-sm font-medium hover:text-primary truncate cursor-pointer">
        {op.leads?.nombre ?? <span className="text-muted-foreground italic">Sin nombre</span>}
      </button>
      <ScoreChip score={op.score_cierre} />
    </div>
  );
}

// ── Sub-componente reutilizable de indicadores ────────────────────────────────

function LeadIndicadores({ op, posicion, onClick }: {
  op: OportunidadRow; posicion: number; onClick: () => void;
}) {
  const sugDot     = op.ia_sugiere !== "ninguna" ? SUGIERE_DOT[op.ia_sugiere] : null;
  const tieneNotas = (op.oportunidades_notas?.length ?? 0) > 0;

  return (
    <>
      <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
        {posicion}
      </span>
      <button onClick={onClick}
        className="flex-1 text-left text-sm font-medium hover:text-primary truncate cursor-pointer">
        <span className="flex items-center gap-1">
          {op.fijado && <span className="text-[9px] text-amber-500" title="Anclado">⚓</span>}
          {op.leads?.nombre ?? <span className="text-muted-foreground italic">Sin nombre</span>}
        </span>
      </button>
      {op.valor_ticket != null && (
        <span className="text-[10px] text-emerald-700 font-medium shrink-0 hidden sm:inline">
          ${(op.valor_ticket / 1000).toFixed(0)}k
        </span>
      )}
      <div className="flex items-center gap-2 shrink-0">
        {tieneNotas && (
          <span className="text-[10px] text-muted-foreground" title="Tiene notas">✏</span>
        )}
        {sugDot && (
          <span className={`w-2 h-2 rounded-full ${sugDot}`} title={`Sugerencia IA: ${op.ia_sugiere}`} />
        )}
        <ScoreChip score={op.score_cierre} />
      </div>
    </>
  );
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span className={`text-xs font-bold tabular-nums shrink-0 ${SCORE_COLOR(score)}`}>
      {score}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcularCountdown(isoStr: string): string {
  const ms = new Date(isoStr).getTime() - Date.now();
  if (ms <= 0) return "Vencido";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(ms / 86_400_000);
  if (h < 1)  return "< 1h";
  if (h < 24) return `${h}h`;
  if (d < 7)  return `${d}d`;
  return new Date(isoStr).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
