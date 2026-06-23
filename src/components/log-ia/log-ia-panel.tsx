"use client";

import { useState, useCallback } from "react";
import type { LogIARow, EventoLogIA } from "@/services/log-ia";
import { LogIAFiltros } from "./log-ia-filtros";
import { LogIAGrupo } from "./log-ia-grupo";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props {
  eventos: EventoLogIA[];
  legacy: LogIARow[];
  totalRegistros: number;
  tokensTotal: number;
  filtros: { tipo?: string; fase?: string; desde?: string; hasta?: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function textoLegacy(log: LogIARow): string {
  const fecha = new Date(log.created_at).toLocaleString("es-MX");
  const m = log.metadata ?? {};
  const tokens = (m.tokens_input as number ?? 0) + (m.tokens_output as number ?? 0);
  return `[${fecha}] ${log.tipo_accion} | ${log.resultado ?? "—"} | ${tokens} tok | ${m.duracion_ms ?? "?"}ms`;
}

function textoEventoExport(evento: EventoLogIA): string {
  const fecha = new Date(evento.timestamp).toLocaleString("es-MX");
  const lines = [`=== ${evento.tipo_accion} · ${fecha} [trace: ${evento.traceId.slice(0,8)}] ===`];
  const todos = [...evento.debugLogs, ...evento.claudeLogs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const log of todos) {
    const m = log.metadata ?? {};
    let det = log.resultado ?? "";
    if (log.fase === "llamado")   det = `model: ${m.model_seleccionado} | msgs: ${m.messages_count}`;
    else if (log.fase === "peticion")  det = `model: ${m.model} | max_tokens: ${m.max_tokens}`;
    else if (log.fase === "respuesta") det = `${log.resultado ?? ""} | tokens: ${m.tokens_input}+${m.tokens_output} | ${m.duracion_ms}ms`;
    lines.push(`  [${log.fase ?? "?"}] ${det}`);
  }
  return lines.join("\n");
}

// ── Componente ────────────────────────────────────────────────────────────────

export function LogIAPanel({ eventos, legacy, totalRegistros, tokensTotal, filtros }: Props) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [todoExpand, setTodoExpand] = useState(false);
  const [copiadoTodo, setCopiadoTodo] = useState(false);

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
      setAbiertos(new Set(eventos.map(e => e.traceId)));
    }
    setTodoExpand(v => !v);
  }, [todoExpand, eventos]);

  const copiarTodo = useCallback(() => {
    const lineas: string[] = [
      `=== Log IA · Exportado: ${new Date().toLocaleString("es-MX")} ===`,
      filtros.tipo  ? `Filtro tipo: ${filtros.tipo}`  : "",
      filtros.fase  ? `Filtro fase: ${filtros.fase}`  : "",
      filtros.desde ? `Desde: ${filtros.desde}`       : "",
      filtros.hasta ? `Hasta: ${filtros.hasta}`       : "",
      "",
    ].filter(Boolean);

    lineas.push(...eventos.map(textoEventoExport));
    if (legacy.length) {
      lineas.push("", "--- Registros sin agrupación ---");
      lineas.push(...legacy.map(textoLegacy));
    }

    navigator.clipboard.writeText(lineas.join("\n")).then(() => {
      setCopiadoTodo(true);
      setTimeout(() => setCopiadoTodo(false), 2000);
    });
  }, [eventos, legacy, filtros]);

  const filtrosActivos = [filtros.tipo, filtros.fase, filtros.desde, filtros.hasta].filter(Boolean).length;
  const totalEventos   = eventos.length;
  const conTrace       = eventos.filter(e => !e.sinTrace).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Log de acciones IA</h1>
          <p className="text-sm text-muted-foreground">
            {totalEventos > 0
              ? <>{totalEventos} eventos · {conTrace} con trace · {legacy.length} sueltos · <span className="font-medium">{tokensTotal.toLocaleString("es-MX")} tokens</span></>
              : <>{totalRegistros} registros · <span className="font-medium">{tokensTotal.toLocaleString("es-MX")} tokens</span></>
            }
            {filtrosActivos > 0 && <span className="ml-2 text-xs text-amber-600">({filtrosActivos} filtro{filtrosActivos > 1 ? "s" : ""} activo{filtrosActivos > 1 ? "s" : ""})</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {eventos.length > 0 && (
            <button onClick={toggleTodos}
              className="rounded border px-2.5 py-1.5 text-xs hover:bg-gray-50 transition-colors">
              {todoExpand ? "Colapsar todo" : "Expandir todo"}
            </button>
          )}
          <button onClick={copiarTodo}
            className="rounded border px-2.5 py-1.5 text-xs hover:bg-gray-50 transition-colors">
            {copiadoTodo ? "✓ Copiado" : "Copiar todo filtrado"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <LogIAFiltros {...filtros} />

      {/* Sin resultados */}
      {eventos.length === 0 && legacy.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sin registros. Las acciones de IA aparecerán aquí conforme el sistema procese mensajes.
        </div>
      )}

      {/* Lista unificada de eventos */}
      {eventos.length > 0 && (
        <div className="space-y-1.5">
          {eventos.map(e => (
            <LogIAGrupo
              key={e.traceId}
              evento={e}
              abierto={abiertos.has(e.traceId)}
              onToggle={() => toggleEvento(e.traceId)}
            />
          ))}
        </div>
      )}

      {/* Registros sueltos (sin trace ni request_id) */}
      {legacy.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Registros sin agrupación — logs anteriores al sistema de trazabilidad
          </p>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="p-2 text-left">Acción</th>
                  <th className="p-2 text-left">Fase</th>
                  <th className="p-2 text-left">Lead</th>
                  <th className="p-2 text-left">Resultado</th>
                  <th className="p-2 text-right">Tokens</th>
                  <th className="p-2 text-right">ms</th>
                  <th className="p-2 text-center">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {legacy.map(r => {
                  const lead = r.leads;
                  const m = r.metadata ?? {};
                  const tIn = m.tokens_input as number | undefined;
                  const tOut = m.tokens_output as number | undefined;
                  const fase = r.fase ?? "respuesta";
                  const FASE_PILL: Record<string, string> = {
                    debug: "bg-gray-100 text-gray-500",
                    warn:  "bg-yellow-100 text-yellow-700",
                    error: "bg-red-100 text-red-700",
                  };
                  const pillCls = FASE_PILL[fase] ?? "bg-green-100 text-green-700";
                  return (
                    <tr key={r.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium text-gray-700">{r.tipo_accion}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pillCls}`}>{fase}</span>
                      </td>
                      <td className="p-2 text-muted-foreground">{lead?.nombre ?? lead?.telefono ?? "—"}</td>
                      <td className="p-2 text-muted-foreground max-w-[200px] truncate" title={r.resultado ?? ""}>{r.resultado ?? "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">{tIn !== undefined && tOut !== undefined ? (tIn + tOut).toLocaleString() : "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">{m.duracion_ms as number ?? "—"}</td>
                      <td className="p-2 text-center text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
