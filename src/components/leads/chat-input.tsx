"use client";

import { useState } from "react";
import type { WaTemplate } from "@/services/wa-templates";
import type { ModoOperacion } from "@/services/sistema";

export type Mensaje = {
  id: string;
  canal: string;
  direccion: string;
  contenido: string;
  intencion_clasificada: string | null;
  interceptado: boolean;
  created_at: string;
};

export type MensajesUpdate =
  | { tipo: "optimista"; tempId: string; msg: Mensaje }
  | { tipo: "confirmado"; tempId: string; msg: Mensaje }
  | { tipo: "error"; tempId: string }
  | { tipo: "simulados"; tempId: string; mensajes: Mensaje[] };

interface Props {
  leadId: string;
  tieneTelefono: boolean;
  dentro24h: boolean;
  modoSistema: ModoOperacion;
  leadNombre: string | null;
  templatesAprobados: WaTemplate[];
  onUpdate: (u: MensajesUpdate) => void;
}

function extraerNumVars(texto: string): number {
  let max = 0;
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(texto)) !== null) max = Math.max(max, Number(m[1]));
  return max;
}

export function ChatInput({
  leadId, tieneTelefono, dentro24h, modoSistema, leadNombre, templatesAprobados, onUpdate,
}: Props) {
  const [modoCliente, setModoCliente] = useState(false);
  const [usandoTemplate, setUsandoTemplate] = useState(!dentro24h);
  const [input, setInput] = useState("");
  const [inputCliente, setInputCliente] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateSel = templatesAprobados.find((t) => t.id === templateId) ?? null;
  const bodyText = templateSel?.componentes.find((c) => c.type === "BODY")?.text ?? "";
  const numVars = extraerNumVars(bodyText);

  function seleccionarTemplate(id: string) {
    setTemplateId(id);
    if (!id) { setVariables([]); return; }
    const t = templatesAprobados.find((t) => t.id === id);
    if (!t) return;
    const body = t.componentes.find((c) => c.type === "BODY")?.text ?? "";
    const n = extraerNumVars(body);
    const vars = Array<string>(n).fill("");
    if (n > 0) vars[0] = leadNombre ?? "";
    setVariables(vars);
  }

  function setVar(i: number, v: string) {
    setVariables((prev) => { const next = [...prev]; next[i] = v; return next; });
  }

  function previewBody() {
    return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const v = variables[Number(n) - 1];
      return v ? `*${v}*` : `{{${n}}}`;
    });
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;
    setInput(""); setError(null); setEnviando(true);
    const tempId = `opt-${Date.now()}`;
    onUpdate({ tipo: "optimista", tempId, msg: { id: tempId, canal: "whatsapp", direccion: "saliente", contenido: texto, intencion_clasificada: null, interceptado: false, created_at: new Date().toISOString() } });
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mensajes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: texto }),
      });
      const data = await res.json();
      if (!res.ok) { onUpdate({ tipo: "error", tempId }); throw new Error(data.error ?? "Error"); }
      onUpdate({ tipo: "confirmado", tempId, msg: data.mensaje });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar");
    } finally { setEnviando(false); }
  }

  async function enviarTemplate() {
    if (!templateId || enviando) return;
    setError(null); setEnviando(true);
    const contenidoOptimista = bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? "");
    const tempId = `opt-${Date.now()}`;
    onUpdate({ tipo: "optimista", tempId, msg: { id: tempId, canal: "whatsapp", direccion: "saliente", contenido: contenidoOptimista, intencion_clasificada: null, interceptado: false, created_at: new Date().toISOString() } });
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mensajes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, variables }),
      });
      const data = await res.json();
      if (!res.ok) { onUpdate({ tipo: "error", tempId }); throw new Error(data.error ?? "Error"); }
      onUpdate({ tipo: "confirmado", tempId, msg: data.mensaje });
      setTemplateId(""); setVariables([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar template");
    } finally { setEnviando(false); }
  }

  async function simularMensaje() {
    const texto = inputCliente.trim();
    if (!texto || enviando) return;
    setInputCliente(""); setError(null); setEnviando(true);
    const tempId = `opt-sim-${Date.now()}`;
    onUpdate({ tipo: "optimista", tempId, msg: { id: tempId, canal: "whatsapp", direccion: "entrante", contenido: texto, intencion_clasificada: null, interceptado: false, created_at: new Date().toISOString() } });
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/simular-mensaje`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: texto }),
      });
      const data = await res.json();
      if (!res.ok) { onUpdate({ tipo: "error", tempId }); throw new Error(data.error ?? "Error al simular"); }
      const mensajes = [data.mensajeEntrante, data.mensajeSaliente].filter(Boolean) as Mensaje[];
      onUpdate({ tipo: "simulados", tempId, mensajes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al simular");
    } finally { setEnviando(false); }
  }

  if (!tieneTelefono) {
    return (
      <p className="text-xs text-muted-foreground text-center py-1">
        Sin teléfono registrado — no se puede enviar por WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toggle modo Admin / Cliente — solo en depuración */}
      {modoSistema === "depuracion" && (
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setModoCliente(false)}
            className={`px-2 py-0.5 rounded-full border transition-colors ${!modoCliente ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
          >Admin</button>
          <button
            onClick={() => setModoCliente(true)}
            className={`px-2 py-0.5 rounded-full border transition-colors ${modoCliente ? "bg-violet-600 text-white border-violet-600" : "border-border text-muted-foreground"}`}
          >Cliente ●</button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {modoCliente ? (
        <div className="flex gap-2 items-end">
          <textarea
            value={inputCliente}
            onChange={(e) => setInputCliente(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); simularMensaje(); } }}
            placeholder="Escribe como si fueras el lead… (la IA responderá)"
            rows={2}
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-violet-50 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
            disabled={enviando}
          />
          <button
            onClick={simularMensaje}
            disabled={enviando || !inputCliente.trim()}
            className="px-3 py-2 rounded-md bg-violet-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-violet-700 transition-colors shrink-0"
          >{enviando ? "…" : "Simular"}</button>
        </div>
      ) : usandoTemplate ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <select
              value={templateId}
              onChange={(e) => seleccionarTemplate(e.target.value)}
              className="flex-1 rounded-md border px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={enviando}
            >
              <option value="">— Seleccionar template —</option>
              {templatesAprobados.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre} ({t.idioma})</option>
              ))}
            </select>
            {dentro24h && (
              <button
                onClick={() => { setUsandoTemplate(false); setTemplateId(""); setVariables([]); }}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0 px-1"
              >← Texto</button>
            )}
          </div>
          {templateSel && (
            <>
              <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2 break-words">
                {previewBody()}
              </p>
              {numVars > 0 && (
                <div className="space-y-1">
                  {Array.from({ length: numVars }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10 shrink-0 font-mono">{`{{${i + 1}}}`}</span>
                      <input
                        type="text"
                        value={variables[i] ?? ""}
                        onChange={(e) => setVar(i, e.target.value)}
                        placeholder={i === 0 ? (leadNombre ?? "nombre") : `variable ${i + 1}`}
                        className="flex-1 rounded-md border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        disabled={enviando}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={enviarTemplate}
                disabled={enviando || !templateId}
                className="w-full px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors"
              >{enviando ? "Enviando…" : "Enviar template"}</button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Escribir como admin… (Enter = enviar, Shift+Enter = nueva línea)"
            rows={2}
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={enviando}
          />
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setUsandoTemplate(true)}
              className="px-3 py-1 rounded-md border text-xs text-muted-foreground hover:bg-muted transition-colors"
            >Template</button>
            <button
              onClick={enviar}
              disabled={enviando || !input.trim()}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors"
            >{enviando ? "…" : "Enviar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
