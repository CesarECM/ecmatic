"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { toast } from "sonner";
import type { AprobacionesData } from "@/app/api/admin/workspace/aprobaciones/route";
import { useWorkspaceOptional } from "./WorkspaceContext";
import { ColaKBSeccion } from "@/app/(dashboard)/admin/aprobaciones/ColaKBSeccion";
import { ColaMatrizSeccion } from "@/app/(dashboard)/admin/aprobaciones/ColaMatrizSeccion";
import { ColaMensajesSeccion } from "@/app/(dashboard)/admin/aprobaciones/ColaMensajesSeccion";
import { ColaGHLSeccion } from "@/app/(dashboard)/admin/aprobaciones/ColaGHLSeccion";
import { ColaSugerenciasSeccion } from "@/app/(dashboard)/admin/aprobaciones/ColaSugerenciasSeccion";
import { KBISugerenciasSeccion } from "@/app/(dashboard)/admin/aprobaciones/KBISugerenciasSeccion";
import {
  aprobarKBISugerenciaAction, rechazarKBISugerenciaAction,
  aprobarEtiquetaAction, archivarEtiquetaAction,
  aprobarComprobanteAction, rechazarComprobanteAction,
  aprobarSugerenciaAction, rechazarSugerenciaAction,
  aprobarClusterAction, rechazarClusterAction,
} from "@/app/(dashboard)/admin/aprobaciones/actions";
import type { Etiqueta } from "@/services/etiquetas";
import type { ComprobanteEnCola } from "@/services/comprobantes";

const STORAGE_KEY = "ecmatic_aprobaciones_autorecarga";
const INTERVALO_S = 15;

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {}
}

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

type EtiquetaItem = Etiqueta & { categoria_nombre: string };

function EtiquetasSeccion({ items, onRemoved }: { items: EtiquetaItem[]; onRemoved: (id: string) => void }) {
  const [, startTransition] = useTransition();

  function accion(id: string, fn: (id: string) => Promise<void>) {
    startTransition(async () => {
      try { await fn(id); onRemoved(id); }
      catch { toast.error("Error al procesar etiqueta"); }
    });
  }

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-pink-500" />
        Etiquetas IA ({items.length})
      </p>
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border p-3">
          <span className="text-xs bg-pink-100 text-pink-700 border border-pink-200 rounded px-1.5 py-0.5">
            {item.categoria_nombre}
          </span>
          <p className="font-medium text-sm mt-1">{item.nombre}</p>
          {item.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">hace {diasDesde(item.created_at)}d</p>
          <div className="flex gap-1 mt-2">
            <button onClick={() => accion(item.id, aprobarEtiquetaAction)}
              className="rounded bg-pink-600 px-3 py-1 text-xs text-white hover:bg-pink-700">Aprobar</button>
            <button onClick={() => accion(item.id, archivarEtiquetaAction)}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Archivar</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function ComprobantesSeccion({ items, onRemoved, onApproved }: {
  items: ComprobanteEnCola[];
  onRemoved: (id: string) => void;
  onApproved?: (lead_id: string) => void;
}) {
  const [, startTransition] = useTransition();

  function aprobar(item: ComprobanteEnCola) {
    startTransition(async () => {
      try {
        await aprobarComprobanteAction(item.id);
        onRemoved(item.id);
        if (item.lead_id) onApproved?.(item.lead_id);
      } catch { toast.error("Error al aprobar comprobante"); }
    });
  }

  function rechazar(id: string) {
    startTransition(async () => {
      try { await rechazarComprobanteAction(id); onRemoved(id); }
      catch { toast.error("Error al rechazar comprobante"); }
    });
  }

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-amber-500" />
        Comprobantes ({items.length})
      </p>
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-muted-foreground">
            {item.lead_nombre ?? item.telefono} · hace {diasDesde(item.created_at)}d
          </p>
          {item.wa_media_id && (
            <a href={`/api/admin/comprobante-imagen/${item.wa_media_id}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-amber-700 underline mt-1 inline-block">Ver imagen</a>
          )}
          <div className="flex gap-1 mt-2">
            <button onClick={() => aprobar(item)}
              className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700">Aprobar → Comprado</button>
            <button onClick={() => rechazar(item.id)}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">Rechazar</button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function AprobacionesPane({ initial }: { initial: AprobacionesData }) {
  const ws = useWorkspaceOptional();
  const [data, setData] = useState<AprobacionesData>(initial);
  const [activo, setActivo] = useState(false);
  const [segundos, setSegundos] = useState(INTERVALO_S);

  // Refs para acceso estable desde setInterval (evita stale closures)
  const selectedLeadIdRef = useRef<string | null>(null);
  const lastServerGHLRef  = useRef(initial.pendientesGHL);
  useEffect(() => { selectedLeadIdRef.current = ws?.selectedLeadId ?? null; }, [ws?.selectedLeadId]);

  const removeFrom = useCallback((key: keyof AprobacionesData, id: string) => {
    setData(d => ({
      ...d,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key]: (d[key] as any[]).filter((x: any) => x.id !== id),
      totalPendientes: Math.max(0, d.totalPendientes - 1),
    }));
  }, []);

  // KBI actions con optimistic remove
  const aprobarKBI = useCallback(async (id: string, override?: { titulo?: string; contenido?: string }) => {
    const res = await aprobarKBISugerenciaAction(id, override);
    if (!res.error) removeFrom("kbiItems", id);
    return res;
  }, [removeFrom]);

  const rechazarKBI = useCallback(async (id: string, feedback: string) => {
    const res = await rechazarKBISugerenciaAction(id, feedback);
    if (!res.error) removeFrom("kbiItems", id);
    return res;
  }, [removeFrom]);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setActivo(true);
  }, []);

  useEffect(() => {
    if (!activo) { setSegundos(INTERVALO_S); return; }
    setSegundos(INTERVALO_S);

    const countdown = setInterval(() => {
      setSegundos(s => (s <= 1 ? INTERVALO_S : s - 1));
    }, 1000);

    const refresh = setInterval(async () => {
      setSegundos(INTERVALO_S);
      try {
        const r = await fetch("/api/admin/workspace/aprobaciones");
        if (!r.ok) return;
        const fresh: AprobacionesData = await r.json();
        const prevGHL = lastServerGHLRef.current;
        lastServerGHLRef.current = fresh.pendientesGHL;
        setData(fresh);
        if (fresh.totalPendientes > 0) playNotificationSound();
        // S143: si el GHL pendiente del lead seleccionado desapareció → refrescar chat
        const cur = selectedLeadIdRef.current;
        if (cur &&
          prevGHL.some(x => x.lead_ecmatic_id === cur) &&
          !fresh.pendientesGHL.some(x => x.lead_ecmatic_id === cur)) {
          ws?.triggerChatRefresh();
        }
      } catch {}
    }, INTERVALO_S * 1000);

    return () => { clearInterval(countdown); clearInterval(refresh); };
  }, [activo]);

  const toggle = useCallback(() => {
    setActivo(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const {
    totalPendientes, kbiItems, mapaKBIRecursos, kb, matriz,
    etiquetasPendientes, comprobantesPendientes, pendientesGHL,
    mensajesPendientes, sugerencias, clusters,
  } = data;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{totalPendientes} pendientes</span>
        <button
          onClick={toggle}
          title={activo ? `Auto-recarga — próxima en ${segundos}s` : "Activar auto-recarga cada 15s"}
          className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors ${
            activo
              ? "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
              : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
          }`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${activo ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          {activo ? `${segundos}s` : "Auto"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {totalPendientes === 0 && (
          <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
            Todo aprobado
          </div>
        )}

        <KBISugerenciasSeccion
          items={kbiItems}
          recursosActuales={mapaKBIRecursos}
          aprobarAction={aprobarKBI}
          rechazarAction={rechazarKBI}
        />

        <ColaKBSeccion items={kb} onRemoved={(id) => removeFrom("kb", id)} />
        <ColaMatrizSeccion items={matriz} onRemoved={(id) => removeFrom("matriz", id)} />

        {etiquetasPendientes.length > 0 && (
          <EtiquetasSeccion items={etiquetasPendientes} onRemoved={(id) => removeFrom("etiquetasPendientes", id)} />
        )}

        {comprobantesPendientes.length > 0 && (
          <ComprobantesSeccion
            items={comprobantesPendientes}
            onRemoved={(id) => removeFrom("comprobantesPendientes", id)}
            onApproved={(lead_id) => ws?.closeLeadInPanel(lead_id)}
          />
        )}

        <ColaGHLSeccion
          items={pendientesGHL}
          onRemoved={(id) => {
            // S143: si el item era del lead seleccionado → refrescar chat
            const item = data.pendientesGHL.find(x => x.id === id);
            removeFrom("pendientesGHL", id);
            if (item?.lead_ecmatic_id && ws?.selectedLeadId === item.lead_ecmatic_id) {
              ws.triggerChatRefresh();
            }
          }}
          onSelectLead={(leadId) => ws?.selectLead(leadId, null)}
        />
        <ColaMensajesSeccion
          items={mensajesPendientes}
          onRemoved={(id) => removeFrom("mensajesPendientes", id)}
          onSelectLead={(leadId) => ws?.selectLead(leadId, null)}
        />

        <ColaSugerenciasSeccion
          items={sugerencias}
          clusters={clusters}
          aprobarAction={aprobarSugerenciaAction}
          rechazarAction={rechazarSugerenciaAction}
          aprobarClusterAction={aprobarClusterAction}
          rechazarClusterAction={rechazarClusterAction}
        />
      </div>
    </div>
  );
}
