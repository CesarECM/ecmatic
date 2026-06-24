"use client";

import { useState, useCallback } from "react";
import type { EventoLog, LogSistemaRow } from "@/services/log-sistema";

// ── Paletas ───────────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  ia:       "bg-purple-100 text-purple-700",
  cron:     "bg-amber-100 text-amber-700",
  webhook:  "bg-blue-100 text-blue-700",
  servicio: "bg-emerald-100 text-emerald-700",
  ui:       "bg-rose-100 text-rose-700",
  auth:     "bg-gray-100 text-gray-700",
};

const CAT_LABEL: Record<string, string> = {
  ia: "IA", cron: "Cron", webhook: "Webhook", servicio: "Servicio", ui: "UI", auth: "Auth",
};

const TIPO_LABEL: Record<string, string> = {
  CONVERSACION:"Conversación WA",    CONVERSACION_SANDBOX:"Sandbox",
  CLASIFICAR:"Clasificar",           RESPUESTA:"Respuesta WA",   CONTEXTO:"Contexto",
  SETTER:"Setter",                   OBJECION:"Objeción",        DESCONFIANZA:"Desconfianza",
  CAGC_INFERIR:"Fase CAGC",         SUGERIR_KB:"Sugerir KB",    ANALISIS:"Análisis",
  VISION:"Visión",                   LEADMAGNET:"Leadmagnet",    CUALIFICACION:"Cualificación",
  SENALES:"Señales",                 PAQUETE_SERVICIO:"Paquete", BRIEF_DISENO:"Brief diseño",
  CLUSTERING:"Clustering",
  AUDITOR_SERVICIO:"Auditor Servicio", AUDITOR_PIPELINE:"Auditor Pipeline",
  PAQUETE_SERVICIO_NUEVO:"Paquete Nuevo",
};

const MODELO_SHORT: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku",
  "claude-sonnet-4-6": "Sonnet",
  "claude-opus-4-8": "Opus",
};

const FASE_DOT: Record<string, string> = {
  inicio:"⚪", ok:"🟢", llamado:"🟡", peticion:"🔵",
  respuesta:"🟢", timeout:"🟠", error:"🔴", warn:"🟡", debug:"⚫",
};

const FASE_BG: Record<string, string> = {
  inicio:    "bg-gray-50 text-gray-600",
  ok:        "bg-green-50 text-green-800",
  llamado:   "bg-yellow-50 text-yellow-800",
  peticion:  "bg-blue-50 text-blue-800",
  respuesta: "bg-green-50 text-green-800",
  timeout:   "bg-orange-50 text-orange-800",
  error:     "bg-red-50 text-red-800",
  warn:      "bg-yellow-50 text-yellow-700",
  debug:     "bg-gray-50 text-gray-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function textoLog(log: LogSistemaRow): string {
  const fecha = new Date(log.created_at).toLocaleString("es-MX");
  const m = log.metadata ?? {};
  const lines = [`[${fecha}] ${log.tipo_accion} · ${log.fase ?? "?"}`];
  if (log.fase === "llamado")    lines.push(`Modelo: ${m.model_seleccionado} | Mensajes: ${m.messages_count} | System: "${String(m.system_prompt_extract ?? "").slice(0, 400)}"`);
  else if (log.fase === "peticion")   lines.push(`Modelo: ${m.model} | max_tokens: ${m.max_tokens} | chars est: ${m.chars_total_est}`);
  else if (log.fase === "respuesta")  lines.push(`Tokens: ${m.tokens_input ?? 0}+${m.tokens_output ?? 0} | ${m.duracion_ms}ms | stop: ${m.stop_reason}`);
  else if (log.resultado) lines.push(`Estado: ${log.resultado}`);
  if ((log.fase === "timeout" || log.fase === "error") && m.error_message) lines.push(`Error: ${m.error_message}`);
  return lines.join("\n");
}

function textoEvento(evento: EventoLog): string {
  const fecha = new Date(evento.timestamp).toLocaleString("es-MX");
  const lines = [`=== [${evento.categoria.toUpperCase()}] ${TIPO_LABEL[evento.tipo_accion] ?? evento.tipo_accion} · ${fecha} [trace: ${evento.traceId.slice(0, 8)}] ===`];
  for (const log of evento.logs) {
    const m = log.metadata ?? {};
    let det = log.resultado ?? "";
    if (log.fase === "llamado")   det = `model: ${m.model_seleccionado} | msgs: ${m.messages_count} | system: "${String(m.system_prompt_extract ?? "").slice(0, 80)}..."`;
    else if (log.fase === "peticion")  det = `model: ${m.model} | max_tokens: ${m.max_tokens} | chars: ${m.chars_total_est}`;
    else if (log.fase === "respuesta") det = `${log.resultado ?? ""} | tokens: ${m.tokens_input}+${m.tokens_output} | ${m.duracion_ms}ms`;
    lines.push(`  [${log.fase ?? "?"}] ${det}`);
  }
  return lines.join("\n");
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props { evento: EventoLog; abierto: boolean; onToggle: () => void }

export function LogGrupo({ evento, abierto, onToggle }: Props) {
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const copiar = useCallback((id: string, texto: string) => {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1500);
    });
  }, []);

  const ultimoLog    = evento.logs[evento.logs.length - 1];
  const faseStatus   = ultimoLog?.fase ?? "debug";
  const metaResp     = ultimoLog?.metadata ?? {};
  const meta0        = evento.logs[0]?.metadata ?? {};
  const modelo       = (metaResp.model ?? meta0.model_seleccionado) as string | undefined;
  const durMs        = metaResp.duracion_ms as number | undefined;
  const lead         = evento.logs.find(l => l.leads)?.leads ?? null;
  const tIn          = metaResp.tokens_input  as number | undefined;
  const tOut         = metaResp.tokens_output as number | undefined;
  const esIA         = evento.categoria === "ia";

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
      {/* Cabecera */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        {/* Categoría */}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CAT_COLOR[evento.categoria] ?? "bg-gray-100 text-gray-700"}`}>
          {CAT_LABEL[evento.categoria] ?? evento.categoria}
        </span>
        {/* Tipo acción */}
        <span className="shrink-0 text-xs font-medium text-gray-700">
          {TIPO_LABEL[evento.tipo_accion] ?? evento.tipo_accion}
        </span>
        {/* Fase del último log */}
        {faseStatus && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${FASE_BG[faseStatus] ?? ""}`}>
            {FASE_DOT[faseStatus]} {faseStatus}
          </span>
        )}
        {/* Total de sub-logs */}
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500">
          {evento.logs.length} log{evento.logs.length !== 1 ? "s" : ""}
        </span>
        {/* Modelo — solo IA */}
        {esIA && modelo && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-purple-50 text-purple-600">
            {MODELO_SHORT[modelo] ?? modelo}
          </span>
        )}
        {/* Lead */}
        {lead && (
          <span className="text-xs text-muted-foreground truncate">{lead.nombre ?? lead.telefono ?? "—"}</span>
        )}
        {/* Sin trace */}
        {evento.sinTrace && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-400 italic">sin trace</span>
        )}
        {/* Stats derecha */}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {esIA && tIn !== undefined && tOut !== undefined && (
            <span className="text-[10px] text-muted-foreground">{(tIn + tOut).toLocaleString()} tok</span>
          )}
          {durMs !== undefined && (
            <span className="text-[10px] text-muted-foreground">{durMs} ms</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(evento.timestamp).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">{evento.traceId.slice(0, 8)}</span>
          {btnCopiar(`e-${evento.traceId}`, textoEvento(evento))}
          <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* Logs expandidos */}
      {abierto && (
        <div className="border-t divide-y bg-white">
          {evento.logs.map(log => {
            const fm = log.metadata ?? {};
            const fase = log.fase ?? "debug";
            return (
              <div key={log.id} className="px-4 py-2 space-y-1">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${FASE_BG[fase] ?? ""}`}>
                    {FASE_DOT[fase]} {fase}
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
                  {fase === "llamado" && <>
                    <span className="mr-3">model: {MODELO_SHORT[fm.model_seleccionado as string] ?? fm.model_seleccionado as string}</span>
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
                  {fase === "peticion" && <>
                    <span className="mr-3">model: {MODELO_SHORT[fm.model as string] ?? fm.model as string}</span>
                    <span className="mr-3">max_tokens: {fm.max_tokens as number ?? "—"}</span>
                    <span>chars est: {(fm.chars_total_est as number)?.toLocaleString()}</span>
                  </>}
                  {fase === "respuesta" && <>
                    <span className="mr-3">entrada: {fm.tokens_input as number} tok</span>
                    <span className="mr-3">salida: {fm.tokens_output as number} tok</span>
                    <span className="mr-3">{fm.duracion_ms as number} ms</span>
                    <span>stop: {fm.stop_reason as string}</span>
                  </>}
                  {(fase === "timeout" || fase === "error") && <>
                    {fm.duracion_ms !== undefined && <span className="mr-3">{fm.duracion_ms as number} ms</span>}
                    {fm.error_message && <span className="text-red-600">{(fm.error_message as string).slice(0, 200)}</span>}
                  </>}
                  {/* Metadata genérica para categorías no-IA */}
                  {!["llamado","peticion","respuesta","timeout","error"].includes(fase) && Object.keys(fm).length > 0 && (
                    <details className="inline">
                      <summary className="cursor-pointer inline text-blue-600">ver metadata</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[9px] bg-gray-50 p-2 rounded border max-h-32 overflow-auto">
                        {JSON.stringify(fm, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
