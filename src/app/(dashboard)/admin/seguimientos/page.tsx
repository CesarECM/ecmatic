// MPS-28 S104 — Panel de gestión de seguimientos del motor de follow-up.
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerKPIsMonitor } from "@/services/seguimiento-monitor";
import { cancelarSeguimientoAction, reprogramarSeguimientoAction } from "./actions";

export const revalidate = 0;
export const metadata   = { title: "Seguimientos · ECMatic" };

type EstadoFiltro = "todos" | "activo" | "escalado" | "cancelado" | "completado";
type TipoFiltro   = "todos" | "nurturing" | "conversational" | "payment" | "demo_agendado";

const ESTADO_TABS = [
  { key: "activo",     label: "Activos"     },
  { key: "escalado",   label: "Escalados"   },
  { key: "cancelado",  label: "Cancelados"  },
  { key: "completado", label: "Completados" },
  { key: "todos",      label: "Todos"       },
] as const;

const TIPO_LABELS: Record<string, string> = {
  nurturing: "Nurturing", conversational: "Conversacional",
  payment: "Pago", demo_agendado: "Post-Demo",
};
const TIPO_COLORS: Record<string, string> = {
  nurturing:      "text-yellow-600 dark:text-yellow-400",
  conversational: "text-blue-600 dark:text-blue-400",
  payment:        "text-orange-600 dark:text-orange-400",
  demo_agendado:  "text-purple-600 dark:text-purple-400",
};
const ESTADO_CLS: Record<string, string> = {
  activo:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  escalado:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  cancelado:  "bg-muted text-muted-foreground",
  completado: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function horaCDMX(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function tiempoRelativo(iso: string) {
  const ms   = new Date(iso).getTime() - Date.now();
  const abs  = Math.abs(ms);
  const mins = Math.floor(abs / 60_000);
  const hrs  = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  const pre  = ms < 0 ? "hace" : "en";
  if (days > 0) return `${pre} ${days}d`;
  if (hrs  > 0) return `${pre} ${hrs}h`;
  return `${pre} ${mins}min`;
}

interface SeguimientoRow {
  id: string; tipo: string; nivel: number; estado: string;
  proximo_at: string; lead_id: string; updated_at: string;
  leads: { nombre: string | null } | null;
}

interface PageProps { searchParams: Promise<{ estado?: string; tipo?: string }> }

export default async function SeguimientosPage({ searchParams }: PageProps) {
  const params       = await searchParams;
  const estadoFiltro = (params.estado ?? "activo") as EstadoFiltro;
  const tipoFiltro   = (params.tipo   ?? "todos")  as TipoFiltro;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  const [kpis, conteoData, vencidosRes] = await Promise.all([
    obtenerKPIsMonitor().catch(() => ({
      activos: 0, atascados: 0, escalados: 0, intentos_24h: 0,
      por_tipo: { nurturing: 0, conversational: 0, payment: 0, demo_agendado: 0 },
    })),
    db.from("seguimiento_lead").select("estado") as Promise<{ data: { estado: string }[] | null }>,
    db.from("seguimiento_lead")
      .select("id", { count: "exact", head: true })
      .eq("estado", "activo")
      .lte("proximo_at", new Date().toISOString()) as Promise<{ count: number | null }>,
  ]);

  const conteos = (conteoData.data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.estado] = (acc[r.estado] ?? 0) + 1;
    acc.todos     = (acc.todos     ?? 0) + 1;
    return acc;
  }, {});

  let q = db
    .from("seguimiento_lead")
    .select("id, tipo, nivel, estado, proximo_at, lead_id, updated_at, leads(nombre)");
  if (estadoFiltro !== "todos") q = q.eq("estado", estadoFiltro);
  if (tipoFiltro   !== "todos") q = q.eq("tipo",   tipoFiltro);
  q = estadoFiltro === "activo"
    ? q.order("proximo_at", { ascending: true })
    : q.order("updated_at", { ascending: false });

  const { data: segs } = await q.limit(100) as { data: SeguimientoRow[] | null };
  const vencidosAhora  = vencidosRes.count ?? 0;

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Seguimientos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Motor de follow-up adaptativo · campaña activa
          </p>
        </div>
        <Link href="/admin/templates"
          className="text-sm font-medium text-primary hover:underline">
          Gestionar templates →
        </Link>
      </div>

      {/* ── KPIs ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Activos"        value={kpis.activos} />
        <KpiCard label="Vencidos ahora" value={vencidosAhora} alarm={vencidosAhora > 0} />
        <KpiCard label="Escalados"      value={kpis.escalados} alarm={kpis.escalados > 0} />
        <KpiCard label="Intentos 24h"   value={kpis.intentos_24h} />
      </div>

      {/* ── Desglose por tipo ───────────────────────────────── */}
      <div className="flex gap-5 text-xs flex-wrap">
        {(Object.entries(kpis.por_tipo) as [string, number][]).map(([tipo, n]) => (
          <span key={tipo}>
            <span className={`font-bold ${TIPO_COLORS[tipo] ?? ""}`}>{n}</span>
            <span className="text-muted-foreground ml-1">{TIPO_LABELS[tipo] ?? tipo}</span>
          </span>
        ))}
      </div>

      {/* ── Tabs de estado ──────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap border-b pb-2">
        {ESTADO_TABS.map(({ key, label }) => {
          const count  = conteos[key] ?? 0;
          const href   = `?estado=${key}${tipoFiltro !== "todos" ? `&tipo=${tipoFiltro}` : ""}`;
          const activo = estadoFiltro === key;
          return (
            <a key={key} href={href}
              className={`rounded-t px-3 py-1.5 text-sm transition-colors ${
                activo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {label}
              {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
            </a>
          );
        })}
      </div>

      {/* ── Filtro por tipo ─────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap">
        {(["todos", "nurturing", "conversational", "payment", "demo_agendado"] as const).map((t) => {
          const href   = `?tipo=${t}${estadoFiltro !== "todos" ? `&estado=${estadoFiltro}` : ""}`;
          const activo = tipoFiltro === t;
          return (
            <a key={t} href={href}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                activo ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              {t === "todos" ? "Todos los tipos" : TIPO_LABELS[t]}
            </a>
          );
        })}
      </div>

      {/* ── Tabla ───────────────────────────────────────────── */}
      {!segs?.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay seguimientos con estos filtros.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Lead", "Tipo", "Niv.", "Estado", "Próximo / Actualizado", "Acciones"].map((h) => (
                  <th key={h} className="text-left p-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {segs.map((seg) => {
                const esActivo    = seg.estado === "activo";
                const estaVencido = esActivo && new Date(seg.proximo_at) < new Date();
                return (
                  <tr key={seg.id} className="hover:bg-muted/30">
                    <td className="p-3 max-w-[150px]">
                      <span className="block truncate font-medium">
                        {seg.leads?.nombre
                          ?? <span className="font-mono text-muted-foreground">{seg.lead_id.slice(-8)}</span>}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${TIPO_COLORS[seg.tipo] ?? "text-muted-foreground"}`}>
                        {TIPO_LABELS[seg.tipo] ?? seg.tipo}
                      </span>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">{seg.nivel}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_CLS[seg.estado] ?? "bg-muted"}`}>
                        {seg.estado}
                      </span>
                      {estaVencido && (
                        <span className="ml-1 text-[10px] text-red-500 font-semibold">VENCIDO</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground tabular-nums">
                      {esActivo ? (
                        <span className={estaVencido ? "text-red-500 font-medium" : ""}>
                          {horaCDMX(seg.proximo_at)}
                          <span className="ml-1 opacity-60">({tiempoRelativo(seg.proximo_at)})</span>
                        </span>
                      ) : (
                        horaCDMX(seg.updated_at)
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link href={`/admin/leads/${seg.lead_id}`}
                          className="text-primary hover:underline font-medium">
                          Ver lead →
                        </Link>
                        {esActivo && (
                          <>
                            <form action={reprogramarSeguimientoAction} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={seg.id} />
                              <select name="horas" defaultValue="4"
                                className="rounded border bg-background px-1.5 py-0.5 text-xs">
                                {[["1h",1],["2h",2],["4h",4],["8h",8],["24h",24],["48h",48]].map(([l, v]) => (
                                  <option key={v} value={v}>+{l}</option>
                                ))}
                              </select>
                              <button type="submit" className="text-blue-600 hover:underline">
                                Reprogramar
                              </button>
                            </form>
                            <form action={cancelarSeguimientoAction}>
                              <input type="hidden" name="id" value={seg.id} />
                              <button type="submit" className="text-red-500 hover:underline">
                                Cancelar
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, alarm = false }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${alarm ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}
