"use client";

import { useState, useCallback, useMemo } from "react";
import type { LogSistemaRow, EventoLog } from "@/services/log-sistema";
import { LogFiltros } from "./log-filtros";
import { LogGrupo } from "./log-grupo";

// ── Helper de exportación ─────────────────────────────────────────────────────

function textoEventoExport(evento: EventoLog): string {
  const fecha = new Date(evento.timestamp).toLocaleString("es-MX");
  const traceLabel = evento.sinTrace ? "sin-trace" : evento.traceId.slice(0, 8);
  const lines = [
    `=== [${evento.categoria.toUpperCase()}] ${evento.tipo_accion} · ${fecha} [trace: ${traceLabel}] ===`,
  ];
  for (const log of evento.logs) {
    lines.push(`  [${log.fase ?? "?"}] ${log.resultado ?? "—"}`);
    if (log.metadata && Object.keys(log.metadata).length > 0) {
      const indented = JSON.stringify(log.metadata, null, 2)
        .split("\n").map(l => "    " + l).join("\n");
      lines.push(indented);
    }
  }
  return lines.join("\n");
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  eventos: EventoLog[];
  legacy: LogSistemaRow[];
  totalRegistros: number;
  tokensTotal: number;
  filtros: { categoria?: string; tipo?: string; fase?: string; desde?: string; hasta?: string };
}

export function LogPanel({ eventos, legacy, totalRegistros, tokensTotal, filtros }: Props) {
  const [abiertos,      setAbiertos]     = useState<Set<string>>(new Set());
  const [todoExpand,    setTodoExpand]    = useState(false);
  const [copiadoTodo,   setCopiadoTodo]  = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [copiadoSel,    setCopiadoSel]   = useState(false);
  const [busqueda,      setBusqueda]      = useState("");

  // Mezcla eventos con trace y registros sueltos en una sola lista ordenada por tiempo
  const todosEventos = useMemo<EventoLog[]>(() => {
    const sueltos: EventoLog[] = legacy.map(r => ({
      traceId:    `legacy-${r.id}`,
      categoria:  r.categoria,
      tipo_accion: r.tipo_accion,
      timestamp:  r.created_at,
      logs:       [r],
      sinTrace:   true,
    }));
    return [...eventos, ...sueltos]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [eventos, legacy]);

  const eventosFiltrados = useMemo<EventoLog[]>(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return todosEventos;
    return todosEventos.filter(e => {
      if (e.tipo_accion.toLowerCase().includes(q)) return true;
      if (e.categoria.toLowerCase().includes(q))  return true;
      for (const log of e.logs) {
        if (log.resultado?.toLowerCase().includes(q))        return true;
        if (log.leads?.nombre?.toLowerCase().includes(q))    return true;
        if (log.leads?.telefono?.includes(q))                return true;
        if (JSON.stringify(log.metadata ?? {}).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [todosEventos, busqueda]);

  const toggleEvento = useCallback((id: string) => {
    setAbiertos(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const toggleTodos = useCallback(() => {
    if (todoExpand) {
      setAbiertos(new Set());
    } else {
      setAbiertos(new Set(todosEventos.map(e => e.traceId)));
    }
    setTodoExpand(v => !v);
  }, [todoExpand, todosEventos]);

  const toggleSeleccion = useCallback((traceId: string, checked: boolean) => {
    setSeleccionados(prev => {
      const n = new Set(prev);
      checked ? n.add(traceId) : n.delete(traceId);
      return n;
    });
  }, []);

  const copiarTodo = useCallback(() => {
    const q = busqueda.trim();
    const lineas: string[] = [
      `=== Log de sistema · Exportado: ${new Date().toLocaleString("es-MX")} ===`,
      filtros.categoria ? `Categoría: ${filtros.categoria}` : "",
      filtros.tipo      ? `Tipo: ${filtros.tipo}`           : "",
      filtros.fase      ? `Fase: ${filtros.fase}`           : "",
      filtros.desde     ? `Desde: ${filtros.desde}`         : "",
      filtros.hasta     ? `Hasta: ${filtros.hasta}`         : "",
      q.length >= 2     ? `Búsqueda: "${q}"`                : "",
      "",
    ].filter(Boolean);
    lineas.push(...eventosFiltrados.map(textoEventoExport));
    navigator.clipboard.writeText(lineas.join("\n")).then(() => {
      setCopiadoTodo(true);
      setTimeout(() => setCopiadoTodo(false), 2000);
    });
  }, [eventosFiltrados, filtros, busqueda]);

  const copiarSeleccionados = useCallback(() => {
    const lineas = todosEventos
      .filter(e => seleccionados.has(e.traceId))
      .map(textoEventoExport);
    navigator.clipboard.writeText(lineas.join("\n\n")).then(() => {
      setCopiadoSel(true);
      setTimeout(() => setCopiadoSel(false), 2000);
    });
  }, [todosEventos, seleccionados]);

  const filtrosActivos = [filtros.categoria, filtros.tipo, filtros.fase, filtros.desde, filtros.hasta].filter(Boolean).length;
  const soloIA         = filtros.categoria === "ia";
  const hayBusqueda    = busqueda.trim().length >= 2;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Log de sistema</h1>
          <p className="text-sm text-muted-foreground">
            {hayBusqueda
              ? <><span className="font-medium">{eventosFiltrados.length}</span> de {todosEventos.length} entradas</>
              : <>{todosEventos.length} entradas · {totalRegistros} registros</>}
            {soloIA && tokensTotal > 0 && (
              <> · <span className="font-medium">{tokensTotal.toLocaleString("es-MX")} tokens IA</span></>
            )}
            {filtrosActivos > 0 && (
              <span className="ml-2 text-xs text-amber-600">
                ({filtrosActivos} filtro{filtrosActivos > 1 ? "s" : ""} activo{filtrosActivos > 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {seleccionados.size > 0 && (
            <button
              onClick={copiarSeleccionados}
              className="rounded border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-100 transition-colors"
            >
              {copiadoSel ? "✓ Copiado" : `Copiar seleccionados (${seleccionados.size})`}
            </button>
          )}
          {todosEventos.length > 0 && (
            <button
              onClick={toggleTodos}
              className="rounded border px-2.5 py-1.5 text-xs hover:bg-gray-50 transition-colors"
            >
              {todoExpand ? "Colapsar todo" : "Expandir todo"}
            </button>
          )}
          <button
            onClick={copiarTodo}
            className="rounded border px-2.5 py-1.5 text-xs hover:bg-gray-50 transition-colors"
          >
            {copiadoTodo ? "✓ Copiado" : "Copiar todo filtrado"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <LogFiltros {...filtros} />

      {/* Buscador de texto libre */}
      <div className="relative">
        <input
          type="search"
          placeholder="Buscar en logs… (tipo acción, resultado, metadata, nombre lead)"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white pr-24"
        />
        {hayBusqueda && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {eventosFiltrados.length} resultado{eventosFiltrados.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Sin resultados */}
      {todosEventos.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin registros. Las acciones del sistema aparecerán aquí conforme se ejecuten.
        </div>
      )}
      {todosEventos.length > 0 && hayBusqueda && eventosFiltrados.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin resultados para <span className="font-medium">"{busqueda.trim()}"</span>
        </div>
      )}

      {/* Lista unificada */}
      {eventosFiltrados.length > 0 && (
        <div className="space-y-1.5">
          {eventosFiltrados.map(e => (
            <LogGrupo
              key={e.traceId}
              evento={e}
              abierto={abiertos.has(e.traceId)}
              onToggle={() => toggleEvento(e.traceId)}
              checked={seleccionados.has(e.traceId)}
              onCheck={checked => toggleSeleccion(e.traceId, checked)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
