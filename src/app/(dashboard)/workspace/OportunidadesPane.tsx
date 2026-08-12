"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useV2Workspace } from "./WorkspaceContext";
import { listarOportunidadesAction, analizarOportunidadAction, buscarLeadsAction, crearOportunidadAction, marcarEstadoOpAction } from "./actions";
import { NotasModal } from "./NotasModal";
import type { V2OportunidadesData } from "@/services/v2/oportunidades";
import type { V2BusquedaResultado, V2OpportunityRow } from "@/lib/supabase/types.v2";

interface Props {
  initial: V2OportunidadesData;
}

// ── Labels y colores ──────────────────────────────────────────────────────────

const CAGC_LABEL: Record<string, string> = {
  conciencia: "C",
  atencion:   "A",
  generacion: "G",
  cierre:     "Ci",
};

const CAGC_COLOR: Record<string, string> = {
  conciencia: "bg-slate-100 text-slate-600",
  atencion:   "bg-blue-100 text-blue-700",
  generacion: "bg-amber-100 text-amber-700",
  cierre:     "bg-green-100 text-green-700",
};

function scoreColor(score: number): string {
  if (score >= 67) return "bg-green-100 text-green-700";
  if (score >= 34) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function diasDesde(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "1d";
  return `${diff}d`;
}

function inactividadColor(isoDate: string): string {
  const dias = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (dias >= 7) return "text-red-500";
  if (dias >= 3) return "text-amber-500";
  return "text-muted-foreground";
}

function diasHastaReactivacion(isoDate: string): string {
  const diff = Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000);
  if (diff <= 0) return "hoy";
  if (diff === 1) return "mañana";
  return `en ${diff}d`;
}

// ── Ordenamiento ─────────────────────────────────────────────────────────────

type OrdenamientoHoy    = "score" | "dias_sin_contacto" | "urgencia";
type OrdenamientoEspera = "fecha_reactivacion" | "score";

function ordenarHoy(lista: V2OpportunityRow[], orden: OrdenamientoHoy): V2OpportunityRow[] {
  return [...lista].sort((a, b) => {
    if (orden === "score")    return b.score_combinado - a.score_combinado;
    if (orden === "urgencia") return b.score_urgencia  - a.score_urgencia;
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
  });
}

function ordenarEspera(lista: V2OpportunityRow[], orden: OrdenamientoEspera): V2OpportunityRow[] {
  return [...lista].sort((a, b) => {
    if (orden === "score") return b.score_combinado - a.score_combinado;
    const fa = a.fecha_reactivacion ?? "9999-12-31";
    const fb = b.fecha_reactivacion ?? "9999-12-31";
    return fa.localeCompare(fb);
  });
}

// ── Componente principal ──────────────────────────────────────────────────────

export function OportunidadesPane({ initial }: Props) {
  const { selectedLeadId, openLead, setRefreshOportunidades } = useV2Workspace();
  const [data, setData]               = useState<V2OportunidadesData>(initial);
  const [vistaEspera, setVistaEspera] = useState(false);
  const [ordenHoy, setOrdenHoy]       = useState<OrdenamientoHoy>("score");
  const [ordenEspera, setOrdenEspera] = useState<OrdenamientoEspera>("fecha_reactivacion");
  const [loading, setLoading]         = useState(false);
  const [analizando, setAnalizando]   = useState<string | null>(null);
  const [notasOp, setNotasOp]         = useState<{ id: string; nombre: string } | null>(null);
  const [query, setQuery]             = useState("");
  const [buscando, setBuscando]       = useState(false);
  const [resultados, setResultados]   = useState<V2BusquedaResultado[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await listarOportunidadesAction();
      setData(fresh);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRefreshOportunidades(refresh);
    return () => setRefreshOportunidades(null);
  }, [refresh, setRefreshOportunidades]);

  // Búsqueda debounced — 300 ms, mínimo 2 chars
  useEffect(() => {
    if (query.length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const res = await buscarLeadsAction(query);
      setResultados(res);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const lista = useMemo(() =>
    vistaEspera
      ? ordenarEspera(data.en_espera, ordenEspera)
      : ordenarHoy(data.accionable, ordenHoy),
    [data, vistaEspera, ordenHoy, ordenEspera],
  );

  // S152.1 — Leads con múltiples oportunidades activas
  const multiOppLeadIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const op of [...data.accionable, ...data.en_espera]) {
      counts.set(op.lead_id, (counts.get(op.lead_id) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [data]);

  const enBusqueda = query.length >= 2;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Oportunidades
          </p>
          {(loading || buscando) && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
        </div>

        {/* Búsqueda S151.3 */}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nombre, teléfono o email…"
          className="w-full text-xs border rounded px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
        />

        {/* Tabs + chips — ocultos durante búsqueda */}
        {!enBusqueda && (
          <>
            <div className="flex gap-1">
              <button
                onClick={() => setVistaEspera(false)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  !vistaEspera
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Hoy ({data.accionable.length})
              </button>
              <button
                onClick={() => setVistaEspera(true)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  vistaEspera
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                En espera ({data.en_espera.length})
              </button>
            </div>

            {!vistaEspera ? (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground mr-0.5">Orden:</span>
                {([ ["score", "Score"], ["urgencia", "Urgencia"], ["dias_sin_contacto", "Sin contacto"] ] as [OrdenamientoHoy, string][]).map(
                  ([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setOrdenHoy(valor)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        ordenHoy === valor
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground mr-0.5">Orden:</span>
                {([ ["fecha_reactivacion", "Próx. fecha"], ["score", "Score"] ] as [OrdenamientoEspera, string][]).map(
                  ([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setOrdenEspera(valor)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        ordenEspera === valor
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Contenido — búsqueda o lista normal */}
      <div className="flex-1 overflow-y-auto">
        {enBusqueda ? (
          /* ── Resultados de búsqueda ── */
          resultados.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">
                {buscando ? "Buscando…" : "Sin resultados."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {resultados.map((r) => (
                <BusquedaRow
                  key={r.id}
                  resultado={r}
                  isSelected={selectedLeadId === r.id}
                  onSelect={() => { openLead(r.id); setQuery(""); }}
                />
              ))}
            </ul>
          )
        ) : (
          /* ── Lista normal ── */
          lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                {vistaEspera
                  ? "No hay oportunidades en espera."
                  : "No hay oportunidades accionables hoy."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {lista.map((op) => (
                <OpRow
                  key={op.id}
                  op={op}
                  isSelected={selectedLeadId === op.lead_id}
                  vistaEspera={vistaEspera}
                  tieneOtrasOps={multiOppLeadIds.has(op.lead_id)}
                  onSelect={() => openLead(op.lead_id)}
                  isAnalizando={analizando === op.id}
                  onAnalizar={async () => {
                    setAnalizando(op.id);
                    try { await analizarOportunidadAction(op.id); }
                    catch { /* fallo silencioso */ }
                    finally { setAnalizando(null); }
                  }}
                  onAbrirNotas={() => setNotasOp({
                    id:     op.id,
                    nombre: op.lead.nombre || op.lead.telefono || "Sin nombre",
                  })}
                  onAccion={async (accion) => {
                    if (accion === "nueva_op") {
                      await crearOportunidadAction(op.lead_id);
                    } else {
                      await marcarEstadoOpAction(op.id, accion as "GANADA" | "PERDIDA" | "INACTIVA" | "LISTA_NEGRA");
                    }
                    void refresh();
                  }}
                />
              ))}
            </ul>
          )
        )}
      </div>

      {notasOp && (
        <NotasModal
          opId={notasOp.id}
          opNombre={notasOp.nombre}
          onClose={() => setNotasOp(null)}
        />
      )}

    </div>
  );
}

// ── Fila de resultado de búsqueda ─────────────────────────────────────────────

function BusquedaRow({
  resultado, isSelected, onSelect,
}: {
  resultado:  V2BusquedaResultado;
  isSelected: boolean;
  onSelect:   () => void;
}) {
  const nombre   = resultado.nombre || resultado.telefono || "Sin nombre";
  const subtitulo = [resultado.telefono, resultado.email].filter(Boolean).join(" · ");

  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
          isSelected ? "bg-primary/5 border-l-2 border-primary" : ""
        }`}
      >
        <p className="text-sm font-medium truncate">{nombre}</p>
        {subtitulo && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitulo}</p>
        )}
        {resultado.oportunidades.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {resultado.oportunidades.map((op) => (
              <span
                key={op.id}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CAGC_COLOR[op.fase_cagc] ?? "bg-muted text-muted-foreground"}`}
              >
                {op.producto_servicio ?? "Sin producto"} · {CAGC_LABEL[op.fase_cagc] ?? op.fase_cagc} · {op.score_combinado}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  );
}

// ── Fila de oportunidad ───────────────────────────────────────────────────────

function OpRow({
  op, isSelected, vistaEspera, tieneOtrasOps, isAnalizando,
  onSelect, onAnalizar, onAbrirNotas, onAccion,
}: {
  op:             V2OpportunityRow;
  isSelected:     boolean;
  vistaEspera:    boolean;
  tieneOtrasOps:  boolean;
  isAnalizando:   boolean;
  onSelect:       () => void;
  onAnalizar:     () => void;
  onAbrirNotas:   () => void;
  onAccion:       (accion: string) => void;
}) {
  const nombre   = op.lead.nombre || op.lead.telefono || "Sin nombre";
  const producto = op.producto_servicio ?? "Sin producto identificado";

  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
          isSelected ? "bg-primary/5 border-l-2 border-primary" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{nombre}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{producto}</p>
          </div>
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${scoreColor(op.score_combinado)}`}>
            {op.score_combinado}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CAGC_COLOR[op.fase_cagc] ?? "bg-muted text-muted-foreground"}`}>
              {CAGC_LABEL[op.fase_cagc] ?? op.fase_cagc}
            </span>

            {!vistaEspera && (
              <span className={`text-[10px] ${inactividadColor(op.updated_at)}`}>
                {diasDesde(op.updated_at)}
              </span>
            )}

            {vistaEspera && op.fecha_reactivacion && (
              <span className="text-[10px] text-amber-600 font-medium">
                {diasHastaReactivacion(op.fecha_reactivacion)}
              </span>
            )}

            {!vistaEspera && op.score_urgencia >= 70 && (
              <span className="text-[10px] text-orange-500 font-medium">
                urgencia {op.score_urgencia}
              </span>
            )}

            {tieneOtrasOps && (
              <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-indigo-100 text-indigo-600">
                multi-op
              </span>
            )}

            {op.pending_contact_points > 0 && (
              <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-sky-100 text-sky-700">
                {op.pending_contact_points} tarea{op.pending_contact_points > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onAbrirNotas(); }}
              title="Notas"
              className="text-[10px] px-1.5 py-0.5 rounded border border-muted hover:bg-muted transition-colors"
            >
              📝
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAnalizar(); }}
              disabled={isAnalizando}
              title="Analizar con IA"
              className="text-[10px] px-1.5 py-0.5 rounded border border-muted hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-wait"
            >
              {isAnalizando ? "…" : "⚡"}
            </button>
            {/* S152.1 + S152.3 — Menú de acciones con <select> nativo */}
            <select
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const val = e.target.value;
                e.target.value = "";
                if (val) onAccion(val);
              }}
              title="Acciones"
              className="text-[10px] px-1 py-0.5 rounded border border-muted bg-background cursor-pointer hover:bg-muted transition-colors appearance-none"
            >
              <option value="">···</option>
              <optgroup label="Oportunidad">
                <option value="nueva_op">+ Nueva oportunidad</option>
              </optgroup>
              <optgroup label="Estado">
                <option value="GANADA">✓ Ganada</option>
                <option value="PERDIDA">✕ Perdida</option>
                <option value="INACTIVA">⏸ Inactiva</option>
                <option value="LISTA_NEGRA">⊘ Lista negra</option>
              </optgroup>
            </select>
          </div>
        </div>
      </button>
    </li>
  );
}
