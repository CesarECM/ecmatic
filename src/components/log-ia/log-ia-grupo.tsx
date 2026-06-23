"use client";

import { useState, useCallback } from "react";
import type { GrupoLogIA, LogIARow, FaseIA } from "@/services/log-ia";

// ── Constantes de display ─────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  CLASIFICAR:"Clasificar",       RESPUESTA:"Respuesta WA",     CONTEXTO:"Contexto",
  SETTER:"Setter",               OBJECION:"Objeción",          DESCONFIANZA:"Desconfianza",
  CAGC_INFERIR:"Fase CAGC",     SUGERIR_KB:"Sugerir KB",      ANALISIS:"Análisis",
  VISION:"Visión",               LEADMAGNET:"Leadmagnet",      CUALIFICACION:"Cualificación",
  SENALES:"Señales",             PAQUETE_SERVICIO:"Paquete",   BRIEF_DISENO:"Brief diseño",
  CLUSTERING:"Clustering",
};
const TIPO_COLOR: Record<string, string> = {
  CLASIFICAR:"bg-sky-100 text-sky-700",         RESPUESTA:"bg-green-100 text-green-700",
  CONTEXTO:"bg-indigo-100 text-indigo-700",     SETTER:"bg-orange-100 text-orange-700",
  OBJECION:"bg-red-100 text-red-700",           DESCONFIANZA:"bg-rose-100 text-rose-700",
  CAGC_INFERIR:"bg-teal-100 text-teal-700",     SUGERIR_KB:"bg-violet-100 text-violet-700",
};
const MODELO_SHORT: Record<string, string> = {
  "claude-haiku-4-5-20251001":"Haiku",
  "claude-sonnet-4-6":"Sonnet",
  "claude-opus-4-8":"Opus",
};
const MODELO_COLOR: Record<string, string> = {
  "claude-haiku-4-5-20251001":"bg-blue-100 text-blue-700",
  "claude-sonnet-4-6":"bg-purple-100 text-purple-700",
  "claude-opus-4-8":"bg-amber-100 text-amber-700",
};
const FASE_DOT: Record<string, string> = {
  llamado:"🟡", peticion:"🔵", respuesta:"🟢", timeout:"🟠", error:"🔴",
  debug:"⚪", warn:"🟡",
};
const FASE_BG: Record<string, string> = {
  llamado:"bg-yellow-50 text-yellow-800",
  peticion:"bg-blue-50 text-blue-800",
  respuesta:"bg-green-50 text-green-800",
  timeout:"bg-orange-50 text-orange-800",
  error:"bg-red-50 text-red-800",
  debug:"bg-gray-50 text-gray-600",
  warn:"bg-yellow-50 text-yellow-700",
};

// ── Helpers de texto para copiar ─────────────────────────────────────────────

function textoLog(log: LogIARow): string {
  const fecha = new Date(log.created_at).toLocaleString("es-MX");
  const m = log.metadata ?? {};
  const lines = [`[${fecha}] ${log.tipo_accion} · ${log.fase ?? "respuesta"}`];
  if (log.fase === "llamado") {
    lines.push(`Modelo: ${m.model_seleccionado} | Mensajes: ${m.messages_count}`);
    lines.push(`System prompt (extracto): "${String(m.system_prompt_extract ?? "").slice(0, 400)}"`);
  } else if (log.fase === "peticion") {
    lines.push(`Modelo: ${m.model} | max_tokens: ${m.max_tokens} | chars estimados: ${m.chars_total_est}`);
    lines.push(`Mensajes: ${m.messages_count}`);
  } else if (log.fase === "respuesta") {
    lines.push(`Tokens: ${m.tokens_input ?? 0} entrada + ${m.tokens_output ?? 0} salida | Duración: ${m.duracion_ms}ms | Stop: ${m.stop_reason}`);
    if (log.resultado) lines.push(`Resultado: "${log.resultado}"`);
  } else {
    if (log.resultado) lines.push(`Estado: ${log.resultado}`);
    if (m.error_message) lines.push(`Error: ${m.error_message}`);
    lines.push(`Duración: ${m.duracion_ms}ms`);
  }
  return lines.join("\n");
}

function textoGrupo(grupo: GrupoLogIA): string {
  const fecha = new Date(grupo.timestamp).toLocaleString("es-MX");
  const lines = [`=== ${TIPO_LABEL[grupo.tipo_accion] ?? grupo.tipo_accion} · ${fecha} [req: ${grupo.request_id.slice(0, 8)}] ===`];
  for (const log of grupo.logs) {
    const m = log.metadata ?? {};
    let det = "";
    if (log.fase === "llamado")   det = `model: ${m.model_seleccionado} | msgs: ${m.messages_count} | system: "${String(m.system_prompt_extract ?? "").slice(0, 100)}..."`;
    else if (log.fase === "peticion")  det = `model: ${m.model} | max_tokens: ${m.max_tokens} | chars: ${m.chars_total_est}`;
    else if (log.fase === "respuesta") det = `${log.resultado ?? ""} | tokens: ${m.tokens_input}+${m.tokens_output} | ${m.duracion_ms}ms`;
    else det = log.resultado ?? String(m.error_message ?? "");
    lines.push(`[${log.fase ?? "?"}] ${det}`);
  }
  return lines.join("\n");
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props { grupo: GrupoLogIA; abierto: boolean; onToggle: () => void }

export function LogIAGrupo({ grupo, abierto, onToggle }: Props) {
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const copiar = useCallback((id: string, texto: string) => {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1500);
    });
  }, []);

  const ultimoLog  = grupo.logs[grupo.logs.length - 1];
  const faseStatus = ultimoLog?.fase ?? "respuesta";
  const meta0      = grupo.logs[0]?.metadata ?? {};
  const metaResp   = ultimoLog?.metadata ?? {};
  const modelo     = (metaResp.model ?? meta0.model_seleccionado) as string | undefined;
  const durMs      = metaResp.duracion_ms as number | undefined;
  const lead       = grupo.logs[0]?.leads;
  const tIn        = metaResp.tokens_input  as number | undefined;
  const tOut       = metaResp.tokens_output as number | undefined;

  const btnCopiar = (id: string, texto: string, label = "Copiar") => (
    <button
      onClick={e => { e.stopPropagation(); copiar(id, texto); }}
      className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] hover:bg-gray-100 transition-colors"
    >
      {copiadoId === id ? "✓ Copiado" : label}
    </button>
  );

  return (
    <div className="rounded border overflow-hidden">
      {/* Cabecera del grupo */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TIPO_COLOR[grupo.tipo_accion] ?? "bg-gray-100 text-gray-700"}`}>
          {TIPO_LABEL[grupo.tipo_accion] ?? grupo.tipo_accion}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${FASE_BG[faseStatus] ?? ""}`}>
          {FASE_DOT[faseStatus]} {faseStatus}
        </span>
        {modelo && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${MODELO_COLOR[modelo] ?? "bg-gray-100 text-gray-600"}`}>
            {MODELO_SHORT[modelo] ?? modelo}
          </span>
        )}
        {lead && (
          <span className="text-xs text-muted-foreground truncate">{lead.nombre ?? lead.telefono ?? "—"}</span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {tIn !== undefined && tOut !== undefined && (
            <span className="text-[10px] text-muted-foreground">{(tIn + tOut).toLocaleString()} tok</span>
          )}
          {durMs !== undefined && (
            <span className="text-[10px] text-muted-foreground">{durMs} ms</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(grupo.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">{grupo.request_id.slice(0, 8)}</span>
          {btnCopiar(`g-${grupo.request_id}`, textoGrupo(grupo), "Copiar grupo")}
          <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* Logs individuales */}
      {abierto && (
        <div className="border-t divide-y bg-white">
          {grupo.logs.map(log => {
            const fm = log.metadata ?? {};
            return (
              <div key={log.id} className="px-4 py-2 space-y-1">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${FASE_BG[log.fase ?? "respuesta"] ?? ""}`}>
                    {FASE_DOT[log.fase ?? "respuesta"]} {log.fase ?? "respuesta"}
                  </span>
                  <span className="text-xs text-gray-700 flex-1 min-w-0 break-words">
                    {log.resultado ?? "—"}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString("es-MX")}
                    </span>
                    {btnCopiar(log.id, textoLog(log))}
                  </div>
                </div>

                {/* Detalle técnico por fase */}
                <div className="ml-14 text-[10px] text-muted-foreground space-y-0.5">
                  {log.fase === "llamado" && <>
                    <span className="mr-3">model: {MODELO_SHORT[fm.model_seleccionado as string] ?? fm.model_seleccionado}</span>
                    <span className="mr-3">msgs: {fm.messages_count as number}</span>
                    {fm.system_prompt_extract && (
                      <details className="inline">
                        <summary className="cursor-pointer inline text-blue-600">ver system prompt</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[9px] bg-gray-50 p-2 rounded border max-h-32 overflow-auto">
                          {fm.system_prompt_extract as string}
                        </pre>
                      </details>
                    )}
                  </>}
                  {log.fase === "peticion" && <>
                    <span className="mr-3">model: {MODELO_SHORT[fm.model as string] ?? fm.model as string}</span>
                    <span className="mr-3">max_tokens: {fm.max_tokens as number ?? "—"}</span>
                    <span>chars estimados: {(fm.chars_total_est as number)?.toLocaleString()}</span>
                  </>}
                  {log.fase === "respuesta" && <>
                    <span className="mr-3">entrada: {fm.tokens_input as number} tok</span>
                    <span className="mr-3">salida: {fm.tokens_output as number} tok</span>
                    <span className="mr-3">{fm.duracion_ms as number} ms</span>
                    <span>stop: {fm.stop_reason as string}</span>
                  </>}
                  {(log.fase === "timeout" || log.fase === "error") && <>
                    <span className="mr-3">{fm.duracion_ms as number} ms</span>
                    {fm.error_message && <span className="text-red-600">{(fm.error_message as string).slice(0, 200)}</span>}
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
