"use client";

// S33.5 + S33.9 — Sección de sugerencias generales con vista Lista / Agrupadas.
// Lista: comportamiento anterior (por prioridad+fecha).
// Agrupadas: clusters con título generado, expandibles, acción en bloque.

import { useState } from "react";
import { toast } from "sonner";
import { BriefCard } from "./BriefCard";
import type { BriefDiseno } from "@/lib/ai/brief-diseno";

export interface SugerenciaItem {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  prioridad: string;
  created_at: string;
  tipo_brief: string | null;
  servicio_id: string | null;
  cluster_id: string | null;
  metadata: Record<string, unknown>;
}

export interface ClusterItem {
  id: string;
  titulo_generado: string;
  conteo: number;
}

interface Props {
  items: SugerenciaItem[];
  clusters: ClusterItem[];
  aprobarAction: (id: string) => Promise<void>;
  rechazarAction: (id: string, feedback: string) => Promise<void>;
  aprobarClusterAction: (clusterId: string) => Promise<void>;
  rechazarClusterAction: (clusterId: string) => Promise<void>;
}

const TIPO_COLOR: Record<string, string> = {
  kb:       "bg-blue-100 text-blue-700 border-blue-200",
  matriz:   "bg-orange-100 text-orange-700 border-orange-200",
  pipeline: "bg-amber-100 text-amber-700 border-amber-200",
  flujo:    "bg-green-100 text-green-700 border-green-200",
  avatar:   "bg-purple-100 text-purple-700 border-purple-200",
  general:  "bg-gray-100 text-gray-700 border-gray-200",
};

const PRIORIDAD_COLOR: Record<string, string> = {
  urgente:       "bg-red-600 text-white",
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-300 text-gray-700",
};

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function SugerenciaCard({
  item,
  onAprobar,
  onRechazar,
}: {
  item: SugerenciaItem;
  onAprobar: () => Promise<void>;
  onRechazar: (feedback: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [modoRechazar, setModoRechazar] = useState(false);
  const [feedback, setFeedback] = useState("");
  const brief = item.metadata?.brief as BriefDiseno | undefined;

  async function handleAprobar() {
    setLoading(true);
    const t = toast.loading("Aprobando...");
    try {
      await onAprobar();
      toast.success("Aprobado", { id: t });
    } catch {
      toast.error("Error al aprobar", { id: t });
    } finally {
      setLoading(false);
    }
  }

  async function handleRechazarConfirmar() {
    if (!feedback.trim()) return;
    setLoading(true);
    const t = toast.loading("Rechazando...");
    try {
      await onRechazar(feedback.trim());
      toast.success("Rechazado", { id: t });
      setModoRechazar(false);
      setFeedback("");
    } catch {
      toast.error("Error al rechazar", { id: t });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs rounded border px-1.5 py-0.5 ${TIPO_COLOR[item.tipo] ?? TIPO_COLOR.general}`}>
              {item.tipo}
            </span>
            {item.tipo_brief === "diseno" && (
              <span className="text-xs rounded border px-1.5 py-0.5 bg-purple-100 text-purple-700 border-purple-200">
                brief diseño
              </span>
            )}
            <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[item.prioridad]}`}>
              {item.prioridad.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
          </div>
          <p className="font-medium text-sm mt-1">{item.titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</p>
          {brief && <BriefCard brief={brief} servicioId={item.servicio_id} />}
        </div>
        {!modoRechazar && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={handleAprobar}
              disabled={loading}
              className="rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Aprobar
            </button>
            <button
              onClick={() => setModoRechazar(true)}
              disabled={loading}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300 disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        )}
      </div>

      {modoRechazar && (
        <div className="p-2 rounded bg-red-50 border border-red-200 space-y-1.5">
          <p className="text-xs font-medium text-red-700">¿Por qué rechazás esta sugerencia?</p>
          <textarea
            autoFocus
            className="w-full rounded border border-red-300 px-2 py-1 text-xs min-h-[44px] resize-none bg-white"
            placeholder="Razón del rechazo (obligatorio)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              onClick={handleRechazarConfirmar}
              disabled={loading || !feedback.trim()}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar rechazo
            </button>
            <button
              onClick={() => { setModoRechazar(false); setFeedback(""); }}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClusterCard({
  cluster,
  items,
  onAprobarCluster,
  onRechazarCluster,
  aprobarAction,
  rechazarAction,
}: {
  cluster: ClusterItem;
  items: SugerenciaItem[];
  onAprobarCluster: () => Promise<void>;
  onRechazarCluster: () => Promise<void>;
  aprobarAction: (id: string) => Promise<void>;
  rechazarAction: (id: string, feedback: string) => Promise<void>;
}) {
  const [expandido, setExpandido] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAprobarCluster() {
    setLoading(true);
    const t = toast.loading(`Aprobando ${items.length} sugerencias...`);
    try {
      await onAprobarCluster();
      toast.success(`${items.length} sugerencias aprobadas`, { id: t });
    } catch {
      toast.error("Error al aprobar cluster", { id: t });
    } finally {
      setLoading(false);
    }
  }

  async function handleRechazarCluster() {
    setLoading(true);
    const t = toast.loading(`Rechazando ${items.length} sugerencias...`);
    try {
      await onRechazarCluster();
      toast.success(`${items.length} sugerencias rechazadas`, { id: t });
    } catch {
      toast.error("Error al rechazar cluster", { id: t });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpandido((v) => !v)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <span className="text-xs text-muted-foreground shrink-0">{expandido ? "▾" : "▸"}</span>
          <span className="font-medium text-sm truncate">{cluster.titulo_generado}</span>
          <span className="text-xs bg-purple-200 text-purple-700 rounded-full px-2 py-0.5 shrink-0">
            {items.length}
          </span>
        </button>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={handleAprobarCluster}
            disabled={loading}
            className="rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Aprobar grupo
          </button>
          <button
            onClick={handleRechazarCluster}
            disabled={loading}
            className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300 disabled:opacity-50"
          >
            Rechazar grupo
          </button>
        </div>
      </div>

      {expandido && (
        <div className="space-y-2 pl-4 border-l-2 border-purple-200">
          {items.map((item) => (
            <SugerenciaCard
              key={item.id}
              item={item}
              onAprobar={() => aprobarAction(item.id)}
              onRechazar={(feedback) => rechazarAction(item.id, feedback)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ColaSugerenciasSeccion({
  items,
  clusters,
  aprobarAction,
  rechazarAction,
  aprobarClusterAction,
  rechazarClusterAction,
}: Props) {
  const [vista, setVista] = useState<"lista" | "agrupadas">("lista");

  if (!items.length) return null;

  const sinCluster = items.filter((i) => !i.cluster_id);
  const conCluster = items.filter((i) => i.cluster_id);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-purple-500" />
          Sugerencias generales ({items.length})
        </p>
        {clusters.length > 0 && (
          <div className="flex rounded border overflow-hidden text-xs">
            <button
              onClick={() => setVista("lista")}
              className={`px-3 py-1 ${vista === "lista" ? "bg-purple-600 text-white" : "hover:bg-gray-100"}`}
            >
              Lista
            </button>
            <button
              onClick={() => setVista("agrupadas")}
              className={`px-3 py-1 ${vista === "agrupadas" ? "bg-purple-600 text-white" : "hover:bg-gray-100"}`}
            >
              Agrupadas ({clusters.length})
            </button>
          </div>
        )}
      </div>

      {vista === "lista" ? (
        <div className="space-y-2">
          {items.map((item) => (
            <SugerenciaCard
              key={item.id}
              item={item}
              onAprobar={() => aprobarAction(item.id)}
              onRechazar={(feedback) => rechazarAction(item.id, feedback)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {clusters.map((cluster) => {
            const itemsDelCluster = conCluster.filter((i) => i.cluster_id === cluster.id);
            if (!itemsDelCluster.length) return null;
            return (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                items={itemsDelCluster}
                onAprobarCluster={() => aprobarClusterAction(cluster.id)}
                onRechazarCluster={() => rechazarClusterAction(cluster.id)}
                aprobarAction={aprobarAction}
                rechazarAction={rechazarAction}
              />
            );
          })}
          {sinCluster.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">Sin agrupar ({sinCluster.length})</p>
              {sinCluster.map((item) => (
                <SugerenciaCard
                  key={item.id}
                  item={item}
                  onAprobar={() => aprobarAction(item.id)}
                  onRechazar={(feedback) => rechazarAction(item.id, feedback)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
