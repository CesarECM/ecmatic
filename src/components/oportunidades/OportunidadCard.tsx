"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import type { OportunidadRow } from "@/services/oportunidades";
import {
  cerrarGanadoAction, cerrarPerdidoAction, posponerSeguimientoAction,
  removerDelPanelAction, desestimnarSugerenciaIAAction,
} from "@/app/(dashboard)/admin/oportunidades/actions";
import { NotasHistorial } from "./NotasHistorial";

const DISC_BADGE: Record<string, string> = {
  D: "bg-red-100 text-red-700",
  I: "bg-yellow-100 text-yellow-700",
  S: "bg-green-100 text-green-700",
  C: "bg-blue-100 text-blue-700",
};

const SUGIERE_CONFIG: Record<string, { label: string; cls: string }> = {
  cerrar_ganado:  { label: "✅ Listo para cerrar", cls: "border-green-400 bg-green-50 text-green-800" },
  cerrar_perdido: { label: "❌ Sugerir descartar",  cls: "border-red-400 bg-red-50 text-red-800" },
  upsell:         { label: "🚀 Oportunidad upsell", cls: "border-purple-400 bg-purple-50 text-purple-800" },
};

interface Props {
  op: OportunidadRow;
  posicionLabel: number;
  dragHandleProps?: Record<string, unknown>;
}

export function OportunidadCard({ op, posicionLabel, dragHandleProps }: Props) {
  const router     = useRouter();
  const lead       = op.leads;
  const [pendingG, startG] = useTransition();
  const [pendingP, startP] = useTransition();
  const [pendingR, startR] = useTransition();
  const [horasPosponer, setHorasPosponer] = useState(4);

  if (!lead) return null;

  const ghlLink = lead.ghl_contact_id
    ? `https://app.gohighlevel.com/contacts/${lead.ghl_contact_id}`
    : null;
  const waLink = lead.telefono
    ? `https://wa.me/${lead.telefono.replace(/\D/g, "")}`
    : null;

  function copiarDatos() {
    const texto = [
      lead?.nombre, lead?.telefono, lead?.email,
      lead?.pipeline_stage, `Score: ${lead?.score_salud}`,
    ].filter(Boolean).join(" | ");
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
    if (!confirm("¿Quitar este lead del panel? No se cerrará, solo saldrá de las 10 oportunidades.")) return;
    startR(async () => { await removerDelPanelAction(op.lead_id); router.refresh(); });
  }
  function handlePosponer() {
    startG(async () => { await posponerSeguimientoAction(op.lead_id, horasPosponer); router.refresh(); });
  }

  const sugerirCfg = op.ia_sugiere !== "ninguna" ? SUGIERE_CONFIG[op.ia_sugiere] : null;

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
          <p className="font-semibold text-sm truncate">{lead.nombre ?? "Sin nombre"}</p>
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

        {/* Notas del admin */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Mis notas</p>
          <NotasHistorial
            oportunidadId={op.id}
            leadId={op.lead_id}
            initialNotas={op.oportunidades_notas ?? []}
          />
        </div>

        {/* Datos de contacto */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {lead.telefono && <span>📞 {lead.telefono}</span>}
          {lead.email    && <span>✉ {lead.email}</span>}
          <span>⭐ {lead.score_salud}/100</span>
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
          {pendingG ? "…" : "✓ Ganado"}
        </button>
        <button onClick={handleCerrarPerdido} disabled={pendingP}
          className="rounded px-2.5 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 cursor-pointer">
          {pendingP ? "…" : "✗ Perdido"}
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
