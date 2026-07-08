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
import type { OportunidadRow } from "@/services/oportunidades";

interface Props {
  oportunidades: OportunidadRow[];
  ultimaIaAt: string | null;
  panelVacio: boolean;
}

const SUGIERE_DOT: Record<string, string> = {
  cerrar_ganado:  "bg-green-500",
  cerrar_perdido: "bg-red-500",
  upsell:         "bg-purple-500",
};

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-green-600" : s >= 40 ? "text-yellow-600" : "text-muted-foreground";

export function OportunidadesClient({ oportunidades, ultimaIaAt, panelVacio }: Props) {
  const router  = useRouter();
  const [items, setItems]         = useState<OportunidadRow[]>(oportunidades);
  const [selected, setSelected]   = useState<OportunidadRow | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [msg, setMsg]             = useState<string | null>(null);
  const [, startReorder]          = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    startReorder(() => void reordenarAction(reordenado.map(({ id, posicion }) => ({ id, posicion }))));
  }

  // Cuando el modal cierra, refrescar los datos del item seleccionado desde items
  function handleOpenChange(open: boolean) {
    if (!open) { setSelected(null); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      {/* ── Barra IA ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0 text-xs">
          {!isStale && staleHours !== null && (
            <span className="text-muted-foreground">Análisis IA actualizado hace {staleHours}h</span>
          )}
          {isStale && !panelVacio && (
            <span className="text-amber-600 font-medium">Análisis IA desactualizado</span>
          )}
          {msg && <span className="text-green-600 ml-2">{msg}</span>}
        </div>
        <button onClick={handleAnalizar} disabled={analizando}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer
            ${isStale || panelVacio ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted/60"}
            ${analizando ? "opacity-50 cursor-not-allowed" : ""}`}>
          {analizando ? <><span className="animate-spin">⟳</span> Analizando…</>
            : panelVacio ? "⚡ Inicializar panel con IA" : "⟳ Reanalizar con IA"}
        </button>
      </div>

      {/* ── Estado vacío ─────────────────────────────────── */}
      {panelVacio && !analizando && (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-2">
          <p className="text-lg font-semibold">Panel vacío</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Presiona &ldquo;Inicializar panel con IA&rdquo; para que Claude seleccione y analice
            las 10 oportunidades más cercanas al cierre.
          </p>
        </div>
      )}

      {/* ── Lista DnD ────────────────────────────────────── */}
      {items.length > 0 && (
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
              posicionLabel={items.findIndex((i) => i.id === selected.id) + 1}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Fila compacta con drag ────────────────────────────────
function SortableRow({
  op, posicion, onClick,
}: {
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

  const lead      = op.leads;
  const sugDot    = op.ia_sugiere !== "ninguna" ? SUGIERE_DOT[op.ia_sugiere] : null;
  const scoreNum  = op.score_cierre;
  const tieneNotas = !!op.notas_admin;

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors group">

      {/* Drag handle */}
      <span {...attributes} {...listeners}
        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground select-none text-base leading-none shrink-0"
        title="Arrastrar">⠿</span>

      {/* Posición */}
      <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
        {posicion}
      </span>

      {/* Nombre — clickeable */}
      <button onClick={onClick}
        className="flex-1 text-left text-sm font-medium hover:text-primary truncate cursor-pointer">
        {lead?.nombre ?? <span className="text-muted-foreground italic">Sin nombre</span>}
      </button>

      {/* Indicadores rápidos */}
      <div className="flex items-center gap-2 shrink-0">
        {tieneNotas && (
          <span className="text-[10px] text-muted-foreground" title="Tiene notas">✏</span>
        )}
        {sugDot && (
          <span className={`w-2 h-2 rounded-full ${sugDot}`} title={`Sugerencia IA: ${op.ia_sugiere}`} />
        )}
        {scoreNum > 0 && (
          <span className={`text-xs font-bold tabular-nums ${SCORE_COLOR(scoreNum)}`}>
            {scoreNum}
          </span>
        )}
      </div>
    </div>
  );
}
