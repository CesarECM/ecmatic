"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { OportunidadRow } from "@/services/oportunidades";
import {
  cerrarGanadoAction, cerrarPerdidoAction, posponerSeguimientoAction,
  removerDelPanelAction, desestimnarSugerenciaIAAction,
  fijarEnPanelAction, actualizarCamposAction,
} from "@/app/(dashboard)/admin/oportunidades/actions";
import { NotasHistorial } from "./NotasHistorial";
import { telVisible } from "@/lib/utils";

const DISC_BADGE: Record<string, string> = {
  D: "bg-red-100 text-red-700",
  I: "bg-yellow-100 text-yellow-700",
  S: "bg-green-100 text-green-700",
  C: "bg-blue-100 text-blue-700",
};

const SUGIERE_CONFIG: Record<string, { label: string; cls: string }> = {
  cerrar_ganado:  { label: "Listo para cerrar", cls: "border-green-400 bg-green-50 text-green-800" },
  cerrar_perdido: { label: "Sugerir descartar",  cls: "border-red-400 bg-red-50 text-red-800" },
  upsell:         { label: "Oportunidad upsell", cls: "border-purple-400 bg-purple-50 text-purple-800" },
};

interface Props {
  op: OportunidadRow;
  posicionLabel: number;
  dragHandleProps?: Record<string, unknown>;
}

export function OportunidadCard({ op, posicionLabel, dragHandleProps }: Props) {
  const router  = useRouter();
  const lead    = op.leads;

  const [pendingG,  startG]  = useTransition();
  const [pendingP,  startP]  = useTransition();
  const [pendingR,  startR]  = useTransition();
  const [pendingFij, startFij] = useTransition();

  const [horasPosponer,  setHorasPosponer]  = useState(4);
  const [editandoCampos, setEditandoCampos] = useState(false);
  const [valorTicket,    setValorTicket]    = useState<string>(
    op.valor_ticket != null ? String(op.valor_ticket) : ""
  );
  const [fechaCompromiso, setFechaCompromiso] = useState<string>(
    op.fecha_compromiso ? new Date(op.fecha_compromiso).toISOString().slice(0, 16) : ""
  );
  const [savingCampos, setSavingCampos] = useState(false);

  if (!lead) return null;

  const ghlLink = lead.ghl_contact_id
    ? `https://app.gohighlevel.com/contacts/${lead.ghl_contact_id}`
    : null;
  const telReal = telVisible(lead.telefono);
  const waLink  = telReal ? `https://wa.me/${telReal.replace(/\D/g, "")}` : null;

  function copiarDatos() {
    const texto = [lead?.nombre, lead?.telefono, lead?.email,
      lead?.pipeline_stage, `Score: ${lead?.score_salud}`].filter(Boolean).join(" | ");
    navigator.clipboard.writeText(texto);
  }

  function handleCerrarGanado() {
    if (!confirm(`¿Cerrar a ${lead?.nombre ?? "este lead"} como GANADO?`)) return;
    startG(async () => { await cerrarGanadoAction(op.lead_id); router.refresh(); });
  }
  function handleCerrarPerdido() {
    if (!confirm(`¿Marcar a ${lead?.nombre ?? "este lead"} como PERDIDO?`)) return;
    startP(async () => { await cerrarPerdidoAction(op.lead_id); router.refresh(); });
  }
  function handleRemover() {
    if (!confirm("¿Quitar este lead del panel? No se cerrará, solo saldrá del seguimiento.")) return;
    startR(async () => { await removerDelPanelAction(op.lead_id); router.refresh(); });
  }
  function handlePosponer() {
    startG(async () => { await posponerSeguimientoAction(op.lead_id, horasPosponer); router.refresh(); });
  }
  function handleToggleFijado() {
    startFij(async () => { await fijarEnPanelAction(op.lead_id, !op.fijado); router.refresh(); });
  }

  async function handleGuardarCampos() {
    setSavingCampos(true);
    try {
      await actualizarCamposAction(op.id, {
        valor_ticket:    valorTicket ? Number(valorTicket) : null,
        fecha_compromiso: fechaCompromiso ? new Date(fechaCompromiso).toISOString() : null,
      });
      setEditandoCampos(false);
      router.refresh();
    } catch { /* ignore */ }
    finally { setSavingCampos(false); }
  }

  const sugerirCfg = op.ia_sugiere !== "ninguna" ? SUGIERE_CONFIG[op.ia_sugiere] : null;

  // Formatear fecha_compromiso relativa
  const fechaCompromisoLabel = op.fecha_compromiso
    ? formatearFechaRelativa(op.fecha_compromiso)
    : null;

  return (
    <div className="rounded-xl border bg-card shadow-sm flex flex-col gap-0 overflow-hidden">

      {/* ── Cabecera ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b bg-muted/30">
        {dragHandleProps && (
          <span {...dragHandleProps}
            className="cursor-grab text-muted-foreground hover:text-foreground select-none text-lg leading-none"
            title="Arrastrar para reordenar">⠿</span>
        )}
        <span className="text-xs font-bold text-muted-foreground w-5 text-center">{posicionLabel}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate">{lead.nombre ?? "Sin nombre"}</p>
            {op.fijado && (
              <span className="text-[9px] text-amber-600 font-bold" title="Anclado manualmente">
                ⚓
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{lead.pipeline_stage ?? "—"}</p>
        </div>
        {lead.temperamento_inferido && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DISC_BADGE[lead.temperamento_inferido] ?? "bg-muted"}`}>
            {lead.temperamento_inferido}
          </span>
        )}
        <ScoreBadge score={op.score_cierre} />
      </div>

      {/* ── Sugerencia IA ─────────────────────────────────────── */}
      {sugerirCfg && (
        <div className={`px-4 py-2 border-b flex items-start gap-2 text-xs ${sugerirCfg.cls} border-l-4`}>
          <span className="font-semibold">{sugerirCfg.label}</span>
          {op.ia_razon && <span className="opacity-80">— {op.ia_razon}</span>}
          <button
            onClick={() => void desestimnarSugerenciaIAAction(op.lead_id).then(() => router.refresh())}
            className="ml-auto shrink-0 opacity-50 hover:opacity-100 text-base leading-none"
            title="Desestimar sugerencia">×</button>
        </div>
      )}

      {/* ── Cuerpo ────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3 flex-1">
        {/* Resumen IA */}
        {op.resumen_ia && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Resumen IA</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{op.resumen_ia}</p>
          </div>
        )}

        {/* Siguiente acción */}
        {op.siguiente_accion_ia && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Siguiente acción</p>
            <p className="text-xs font-medium text-primary">{op.siguiente_accion_ia}</p>
          </div>
        )}

        {/* Razonamiento del score */}
        {op.razon_score && (
          <p className="text-[10px] text-muted-foreground italic">{op.razon_score}</p>
        )}

        {/* ── Ticket + compromiso ── */}
        {!editandoCampos ? (
          <div className="flex items-center gap-3 flex-wrap">
            {op.valor_ticket != null && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                ${op.valor_ticket.toLocaleString("es-MX")} MXN
              </span>
            )}
            {fechaCompromisoLabel && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                Compromiso: {fechaCompromisoLabel}
              </span>
            )}
            <button
              onClick={() => setEditandoCampos(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              {op.valor_ticket != null || op.fecha_compromiso ? "Editar" : "+ Ticket / Fecha compromiso"}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 rounded border bg-muted/20 p-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-20 shrink-0">Ticket $MXN</label>
              <input
                type="number"
                value={valorTicket}
                onChange={(e) => setValorTicket(e.target.value)}
                placeholder="ej: 10000"
                className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-20 shrink-0">Compromiso</label>
              <input
                type="datetime-local"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
                className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => setEditandoCampos(false)}
                className="rounded border px-2 py-0.5 text-[9px] text-muted-foreground cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleGuardarCampos()}
                disabled={savingCampos}
                className="rounded bg-primary px-2 py-0.5 text-[9px] text-primary-foreground disabled:opacity-50 cursor-pointer"
              >
                {savingCampos ? "…" : "Guardar"}
              </button>
            </div>
          </div>
        )}

        {/* Notas del admin */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Mis notas</p>
          <NotasHistorial
            oportunidadId={op.id}
            leadId={op.lead_id}
            initialNotas={op.oportunidades_notas ?? []}
            preguntaClave={op.pregunta_clave}
          />
        </div>

        {/* Datos de contacto */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {telReal && <span>📞 {telReal}</span>}
          {lead.email    && <span>✉ {lead.email}</span>}
          <span>⭐ {lead.score_salud}/100</span>
          {op.prioridad_compuesta != null && (
            <span className="text-muted-foreground/60">P: {Math.round(op.prioridad_compuesta)}</span>
          )}
        </div>

        {/* Enlaces */}
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/leads/${op.lead_id}`} target="_blank"
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            ECMatic ↗
          </a>
          {ghlLink && (
            <a href={ghlLink} target="_blank"
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              GHL ↗
            </a>
          )}
          {waLink && (
            <a href={waLink} target="_blank"
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              WhatsApp ↗
            </a>
          )}
          <button onClick={copiarDatos}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer">
            Copiar datos
          </button>
        </div>
      </div>

      {/* ── Acciones ──────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t bg-muted/20 flex flex-wrap items-center gap-2">
        <button onClick={handleCerrarGanado} disabled={pendingG}
          className="rounded px-2.5 py-1 text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
          {pendingG ? "…" : "Ganado"}
        </button>
        <button onClick={handleCerrarPerdido} disabled={pendingP}
          className="rounded px-2.5 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 cursor-pointer">
          {pendingP ? "…" : "Perdido"}
        </button>
        <button
          onClick={handleToggleFijado}
          disabled={pendingFij}
          title={op.fijado ? "Liberar posición (el algoritmo puede moverlo)" : "Anclar en posición actual"}
          className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50
            ${op.fijado
              ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-muted text-muted-foreground hover:bg-muted/60"}`}
        >
          {pendingFij ? "…" : op.fijado ? "⚓ Anclado" : "Anclar"}
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <select value={horasPosponer} onChange={(e) => setHorasPosponer(Number(e.target.value))}
            className="rounded border bg-background px-1.5 py-0.5 text-[10px]">
            {[1, 2, 4, 8, 24, 48, 72].map((h) => (
              <option key={h} value={h}>+{h}h</option>
            ))}
          </select>
          <button onClick={handlePosponer} disabled={pendingG}
            className="rounded px-2 py-0.5 text-[10px] border text-muted-foreground hover:bg-muted/60 cursor-pointer">
            Posponer
          </button>
          <button onClick={handleRemover} disabled={pendingR}
            className="rounded px-2 py-0.5 text-[10px] border border-dashed text-muted-foreground hover:text-foreground cursor-pointer">
            Quitar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-400" : "bg-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <span className="text-xs font-bold tabular-nums">{score}</span>
      <div className="w-8 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function formatearFechaRelativa(isoStr: string): string {
  const fecha = new Date(isoStr);
  const now   = Date.now();
  const diff  = fecha.getTime() - now;
  const abs   = Math.abs(diff);
  const h     = Math.floor(abs / 3_600_000);
  const d     = Math.floor(abs / 86_400_000);

  if (diff < 0) {
    if (h < 1)  return "hace menos de 1h";
    if (h < 24) return `hace ${h}h`;
    return `hace ${d}d`;
  }
  if (h < 1)  return "en menos de 1h";
  if (h < 24) return `en ${h}h`;
  if (d < 7)  return `en ${d}d`;
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
