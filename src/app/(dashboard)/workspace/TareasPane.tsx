"use client";

import { useState, useEffect, useCallback } from "react";
import { useV2Workspace } from "./WorkspaceContext";
import { listarTareasAction } from "./actions";
import { TareaDetalle } from "./TareaDetalle";
import { KbItemDetalle } from "./KbItemDetalle";
import { KbxReviewDetalle } from "./KbxReviewDetalle";
import type { V2TareasData } from "@/services/v2/tareas";
import type {
  V2AutoEnviadoRow,
  V2KbItem,
  V2KbxQueueRow,
  V2TaskRow,
  V2TipoContactPoint,
} from "@/lib/supabase/types.v2";

interface Props {
  initial: V2TareasData;
}

const TIPO_CHIP: Record<V2TipoContactPoint, { label: string; cls: string }> = {
  whatsapp:     { label: "WA",      cls: "bg-green-100 text-green-700" },
  email:        { label: "Email",   cls: "bg-blue-100 text-blue-700" },
  llamada:      { label: "Llamada", cls: "bg-purple-100 text-purple-700" },
  videollamada: { label: "Video",   cls: "bg-indigo-100 text-indigo-700" },
};

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  pendiente_generacion: { label: "Pendiente IA", cls: "bg-amber-100 text-amber-700" },
  generado:             { label: "Por aprobar",  cls: "bg-sky-100 text-sky-700" },
};

const KB_TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  FAQ: { label: "FAQ", cls: "bg-blue-100 text-blue-700" },
  IC:  { label: "IC",  cls: "bg-violet-100 text-violet-700" },
};

const KBX_ACCION_BADGE: Record<string, { label: string; cls: string }> = {
  eliminar:        { label: "Eliminar",  cls: "bg-red-100 text-red-700" },
  unir:            { label: "Unir",      cls: "bg-amber-100 text-amber-700" },
  separar:         { label: "Separar",   cls: "bg-blue-100 text-blue-700" },
  marcar_obsoleto: { label: "Obsoleto",  cls: "bg-gray-100 text-gray-600" },
};

function tiempoEspera(isoDate: string): string {
  const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000);
  if (mins < 60)   return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function TareasPane({ initial }: Props) {
  const { selectedLeadId, openLead, setRefreshTareas } = useV2Workspace();
  const [items, setItems]               = useState<V2TaskRow[]>(initial.items);
  const [kbPropuestos, setKbPropuestos] = useState<V2KbItem[]>(initial.kbPropuestos);
  const [autoEnviados, setAutoEnviados] = useState<V2AutoEnviadoRow[]>(initial.autoEnviados);
  const [kbxPendientes, setKbxPendientes] = useState<V2KbxQueueRow[]>(initial.kbxPendientes);
  const [loading, setLoading]           = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null);
  const [expandedKbxId, setExpandedKbxId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await listarTareasAction();
      setItems(fresh.items);
      setKbPropuestos(fresh.kbPropuestos);
      setAutoEnviados(fresh.autoEnviados);
      setKbxPendientes(fresh.kbxPendientes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRefreshTareas(refresh);
    return () => setRefreshTareas(null);
  }, [refresh, setRefreshTareas]);

  const totalItems = items.length + kbPropuestos.length + kbxPendientes.length;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Tareas
        </p>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {totalItems}
            </span>
          )}
          {loading && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
        </div>
      </div>

      {/* Cola */}
      <div className="flex-1 overflow-y-auto">
        {totalItems === 0 && autoEnviados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>
          </div>
        ) : (
          <div>
            {/* Mantenimiento KB — alertas KBX (máxima prioridad) */}
            {kbxPendientes.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Mantenimiento KB ({kbxPendientes.length})
                </p>
                <ul className="divide-y">
                  {kbxPendientes.map((kbx) => (
                    <KbxItemRow
                      key={kbx.id}
                      item={kbx}
                      isExpanded={expandedKbxId === kbx.id}
                      onSelect={() => setExpandedKbxId((prev) => prev === kbx.id ? null : kbx.id)}
                      onDone={() => { setExpandedKbxId(null); void refresh(); }}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* Revisión KB — propuestas generadas por retroalimentación */}
            {kbPropuestos.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Revisión KB ({kbPropuestos.length})
                </p>
                <ul className="divide-y">
                  {kbPropuestos.map((kb) => (
                    <KbItemRow
                      key={kb.id}
                      item={kb}
                      isExpanded={expandedKbId === kb.id}
                      onSelect={() => setExpandedKbId((prev) => prev === kb.id ? null : kb.id)}
                      onDone={() => { setExpandedKbId(null); void refresh(); }}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* Cola unificada — más antiguo primero, sin importar estado */}
            {items.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Por hacer ({items.length})
                </p>
                <ul className="divide-y">
                  {items.map((t) => (
                    <TareaRowWithDetail
                      key={t.id}
                      tarea={t}
                      isSelected={selectedLeadId === t.lead_id}
                      isExpanded={expandedId === t.id}
                      onSelect={() => { openLead(t.lead_id); setExpandedId((prev) => prev === t.id ? null : t.id); }}
                      onDone={() => { setExpandedId(null); void refresh(); }}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* Feed auto-enviados — log de los últimos 5 sin intervención humana */}
            {autoEnviados.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Auto-enviados ({autoEnviados.length})
                </p>
                <ul className="divide-y">
                  {autoEnviados.map((a) => (
                    <li key={a.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm truncate text-muted-foreground">
                          {a.lead.nombre || a.lead.telefono || "Sin nombre"}
                        </p>
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          ✓ {a.confianza}%
                        </span>
                      </div>
                      {a.contenido_final && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                          {a.contenido_final.slice(0, 70)}{a.contenido_final.length > 70 ? "…" : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── KBX maintenance row ────────────────────────────────────────────────────────

function KbxItemRow({
  item, isExpanded, onSelect, onDone,
}: {
  item:       V2KbxQueueRow;
  isExpanded: boolean;
  onSelect:   () => void;
  onDone:     () => void;
}) {
  const badge   = KBX_ACCION_BADGE[item.accion_sugerida] ?? { label: item.accion_sugerida, cls: "bg-muted text-muted-foreground" };
  const preview = item.razon?.slice(0, 80) ?? "";

  return (
    <>
      <li>
        <button
          onClick={onSelect}
          className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
            isExpanded ? "bg-orange-50 border-l-2 border-orange-400" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate text-orange-700">KBX alerta</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {tiempoEspera(item.created_at)}
            </span>
          </div>
          {preview && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 text-left">
              {preview}{(item.razon?.length ?? 0) > 80 ? "…" : ""}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
              {badge.label}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {item.kb_item_ids.length} item{item.kb_item_ids.length > 1 ? "s" : ""}
            </span>
          </div>
        </button>
      </li>
      {isExpanded && <KbxReviewDetalle item={item} onDone={onDone} />}
    </>
  );
}

// ── KB propuesto row ───────────────────────────────────────────────────────────

function KbItemRow({
  item, isExpanded, onSelect, onDone,
}: {
  item:       V2KbItem;
  isExpanded: boolean;
  onSelect:   () => void;
  onDone:     () => void;
}) {
  const badge   = KB_TIPO_BADGE[item.tipo] ?? { label: item.tipo, cls: "bg-muted text-muted-foreground" };
  const preview = item.contenido.slice(0, 90);

  return (
    <>
      <li>
        <button
          onClick={onSelect}
          className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
            isExpanded ? "bg-violet-50 border-l-2 border-violet-500" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate text-violet-700">KB propuesta</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {tiempoEspera(item.created_at)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 text-left">
            {preview}{item.contenido.length > 90 ? "…" : ""}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
              {badge.label}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              Revisión pendiente
            </span>
          </div>
        </button>
      </li>
      {isExpanded && <KbItemDetalle item={item} onDone={onDone} />}
    </>
  );
}

// ── Contact point row ──────────────────────────────────────────────────────────

function TareaRow({
  tarea,
  isSelected,
  onSelect,
}: {
  tarea:      V2TaskRow;
  isSelected: boolean;
  onSelect:   () => void;
}) {
  const nombre  = tarea.lead.nombre || tarea.lead.telefono || "Sin nombre";
  const tipo    = TIPO_CHIP[tarea.tipo]      ?? { label: tarea.tipo,   cls: "bg-muted text-muted-foreground" };
  const estado  = ESTADO_BADGE[tarea.estado] ?? { label: tarea.estado, cls: "bg-muted text-muted-foreground" };
  const preview = tarea.contenido_propuesto?.slice(0, 80);

  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
          isSelected ? "bg-primary/5 border-l-2 border-primary" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{nombre}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {tiempoEspera(tarea.created_at)}
          </span>
        </div>
        {preview && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 text-left">
            {preview}{tarea.contenido_propuesto!.length > 80 ? "…" : ""}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tipo.cls}`}>
            {tipo.label}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${estado.cls}`}>
            {estado.label}
          </span>
          {tarea.es_fusionado && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">
              Fusionado
            </span>
          )}
          {!!(tarea.metadata as Record<string, unknown>)?.muestreo_forzado && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
              Muestra
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function TareaRowWithDetail({
  tarea, isSelected, isExpanded, onSelect, onDone,
}: {
  tarea:      V2TaskRow;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect:   () => void;
  onDone:     () => void;
}) {
  return (
    <>
      <TareaRow tarea={tarea} isSelected={isSelected} onSelect={onSelect} />
      {isExpanded && <TareaDetalle tarea={tarea} onDone={onDone} />}
    </>
  );
}
