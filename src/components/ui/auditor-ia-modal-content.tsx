"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  aprobarSugerenciaModalAction,
  rechazarSugerenciaModalAction,
  dispararAuditoriaAhoraAction,
} from "@/app/(dashboard)/admin/auditor-ia/actions";
import type { EstadoAuditoria, SugerenciaPanel, TipoAuditoria } from "@/app/(dashboard)/admin/auditor-ia/actions";

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-200 text-gray-700",
};

const SETTER_FASES = [
  "Apertura", "Diagnóstico", "Identificación del dolor",
  "Situación deseada", "Cualificación", "Transición y agendamiento",
];

function tiempoRelativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function SugerenciaRow({
  item,
  onAprobar,
  onRechazar,
}: {
  item: SugerenciaPanel;
  onAprobar: () => Promise<void>;
  onRechazar: () => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const urgencia = (item.metadata?.urgencia ?? item.prioridad ?? "puede_esperar") as string;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[urgencia] ?? PRIORIDAD_COLOR.puede_esperar}`}>
          {urgencia.replace("_", " ")}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">{tiempoRelativo(item.created_at)}</span>
      </div>
      <p className="text-xs font-medium">{item.titulo}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.descripcion}</p>
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={() => startTransition(() => onAprobar())}
          className="rounded bg-purple-600 px-2.5 py-1 text-[11px] text-white hover:bg-purple-700"
        >
          ✓ Aprobar
        </button>
        <button
          onClick={() => startTransition(() => onRechazar())}
          className="rounded bg-gray-100 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-200"
        >
          ✗ Rechazar
        </button>
      </div>
    </div>
  );
}

function ScoreBarra({ score }: { score: number }) {
  const color = score >= 67 ? "bg-green-500" : score >= 34 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 67 ? "text-green-600" : score >= 34 ? "text-yellow-600" : "text-red-600"}`}>
        {score}/100
      </span>
    </div>
  );
}

interface Props {
  estado: EstadoAuditoria;
  tipo: TipoAuditoria;
  entityId: string;
  onRefrescar: () => Promise<void>;
}

export function AuditorIAModalContent({ estado, tipo, entityId, onRefrescar }: Props) {
  const [auditando, setAuditando] = useState(false);

  async function handleAprobar(id: string) {
    const t = toast.loading("Aprobando...");
    try {
      await aprobarSugerenciaModalAction(id);
      toast.success("Aprobado", { id: t });
      await onRefrescar();
    } catch {
      toast.error("Error al aprobar", { id: t });
    }
  }

  async function handleRechazar(id: string) {
    const t = toast.loading("Rechazando...");
    try {
      await rechazarSugerenciaModalAction(id);
      toast.success("Rechazado", { id: t });
      await onRefrescar();
    } catch {
      toast.error("Error al rechazar", { id: t });
    }
  }

  async function handleAuditarAhora() {
    setAuditando(true);
    const t = toast.loading("Ejecutando auditoría IA…");
    try {
      const res = await dispararAuditoriaAhoraAction(tipo, entityId);
      if (res.ok) {
        toast.success("Auditoría completada", { id: t });
        await onRefrescar();
      } else {
        toast.error(res.mensaje ?? "Error", { id: t });
      }
    } catch {
      toast.error("Error en auditoría", { id: t });
    } finally {
      setAuditando(false);
    }
  }

  const puedeAuditarAhora = tipo !== "kb";

  return (
    <div className="space-y-4 text-sm">
      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted/50 p-2.5 space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Última auditoría</p>
          <p className="font-medium text-xs">
            {estado.ultima_auditoria_at
              ? `${tiempoRelativo(estado.ultima_auditoria_at)} · ${new Date(estado.ultima_auditoria_at).toLocaleDateString("es-MX")}`
              : "Sin registro"}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5 space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Próxima revisión</p>
          <p className="font-medium text-xs">{estado.proxima_revision_label}</p>
        </div>
      </div>

      {/* Métricas del lead */}
      {tipo === "lead" && estado.datos_lead && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Salud del lead</p>
          <ScoreBarra score={estado.datos_lead.score_salud} />
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Etapa: </span>
              <span className="font-medium">{estado.datos_lead.pipeline_stage}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Setter: </span>
              <span className="font-medium">
                {estado.datos_lead.setter_fase_actual !== null
                  ? `F${estado.datos_lead.setter_fase_actual + 1} · ${SETTER_FASES[estado.datos_lead.setter_fase_actual] ?? "—"}`
                  : "Sin iniciar"}
              </span>
            </div>
            {estado.datos_lead.setter_calificado !== null && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Cualificado: </span>
                <span className={`font-medium ${estado.datos_lead.setter_calificado ? "text-green-600" : "text-red-600"}`}>
                  {estado.datos_lead.setter_calificado ? "Sí ✓" : "No ✗"}
                </span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-muted-foreground">Contexto IA: </span>
              <span className="font-medium">{tiempoRelativo(estado.datos_lead.contexto_updated_at)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Protocolo de etapa */}
      {tipo === "etapa" && estado.protocolo_etapa && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Protocolo actual</p>
            <span className={`text-[10px] rounded px-1.5 py-0.5 ${estado.protocolo_etapa.tipo_protocolo === "ia-propuesto" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {estado.protocolo_etapa.tipo_protocolo === "ia-propuesto" ? "IA propuesto" : "Manual"}
            </span>
          </div>
          {estado.protocolo_etapa.regla_avance && (
            <p className="text-[11px]"><span className="font-medium text-green-700">▶ Avance:</span> {estado.protocolo_etapa.regla_avance}</p>
          )}
          {estado.protocolo_etapa.regla_retroceso && (
            <p className="text-[11px]"><span className="font-medium text-red-700">◀ Retroceso:</span> {estado.protocolo_etapa.regla_retroceso}</p>
          )}
          {estado.protocolo_etapa.regla_espera && (
            <p className="text-[11px]"><span className="font-medium text-yellow-700">⏸ Espera:</span> {estado.protocolo_etapa.regla_espera}</p>
          )}
          {!estado.protocolo_etapa.regla_avance && !estado.protocolo_etapa.regla_retroceso && !estado.protocolo_etapa.regla_espera && (
            <p className="text-[11px] text-muted-foreground">Sin reglas definidas aún.</p>
          )}
        </div>
      )}
      {tipo === "etapa" && !estado.protocolo_etapa && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
          Esta etapa no tiene protocolo definido. Audita ahora para que la IA proponga uno.
        </p>
      )}

      {/* KB sin sugerencias */}
      {tipo === "kb" && estado.sugerencias_pendientes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          La calidad de KB se analiza globalmente cada lunes 7am. Sin sugerencias pendientes.
        </p>
      )}

      {/* Sugerencias pendientes */}
      {estado.sugerencias_pendientes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">
            Sugerencias pendientes ({estado.sugerencias_pendientes.length})
          </p>
          {estado.sugerencias_pendientes.map((s) => (
            <SugerenciaRow
              key={s.id}
              item={s}
              onAprobar={() => handleAprobar(s.id)}
              onRechazar={() => handleRechazar(s.id)}
            />
          ))}
        </div>
      )}

      {/* Sin sugerencias para tipos con sugerencias */}
      {["servicio", "pipeline"].includes(tipo) && estado.sugerencias_pendientes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sin sugerencias pendientes. El sistema está al día.
        </p>
      )}

      {/* Historial reciente */}
      {estado.historial_reciente.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Historial reciente</p>
          {estado.historial_reciente.map((h) => (
            <div key={h.id} className="flex items-start gap-1.5 text-[11px]">
              <span className={h.aprobado ? "text-green-600" : "text-red-500"}>
                {h.aprobado ? "✓" : "✗"}
              </span>
              <span className="text-muted-foreground line-clamp-1 flex-1">{h.titulo}</span>
              <span className="text-muted-foreground shrink-0">{tiempoRelativo(h.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Botón Auditar ahora */}
      <div className="pt-1">
        <button
          onClick={handleAuditarAhora}
          disabled={auditando || !puedeAuditarAhora}
          className="w-full rounded-md py-2 text-xs font-semibold text-white bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {auditando ? "Auditando… (puede tardar unos segundos)" : "⚡ Auditar ahora"}
        </button>
        {!puedeAuditarAhora && (
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            La KB se audita globalmente desde /admin/automatizaciones
          </p>
        )}
      </div>
    </div>
  );
}
