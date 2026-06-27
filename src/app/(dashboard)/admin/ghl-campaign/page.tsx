import { createServiceClient } from "@/lib/supabase/service";
import { obtenerStatsAB } from "@/services/ab-workflows-ghl";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  obtenerEstadosLeadsCampana, type EstadosLeadsCampana,
} from "@/services/ghl-aprobacion";
import { CampanaControls } from "./CampanaControls";

export const metadata = { title: "Campaña SBC · ECMatic" };
export const revalidate = 0;

const CAMPANA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

export default async function GHLCampaignPage() {
  const supabase = createServiceClient();

  let stats: Awaited<ReturnType<typeof obtenerStatsAB>> | null = null;
  let errorMsg: string | null = null;

  try {
    stats = await obtenerStatsAB(CAMPANA);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const [aprobacionStats, enviadosHoy, pendientes, estadosLeads] = await Promise.all([
    obtenerStatsAprobacion(CAMPANA),
    contarEnviadosHoy(CAMPANA),
    contarPendientes(CAMPANA),
    obtenerEstadosLeadsCampana(CAMPANA),
  ]);

  const { data: recientes } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("ghl_contact_id, nombre, categoria_sbc, variante, enviado, enviado_at, respuesta_tipo, convirtio, error_msg, updated_at")
    .eq("campana", CAMPANA)
    .order("updated_at", { ascending: false })
    .limit(500) as {
      data: {
        ghl_contact_id: string; nombre: string | null; categoria_sbc: string;
        variante: "a" | "b" | null; enviado: boolean; enviado_at: string | null;
        respuesta_tipo: string | null; convirtio: boolean | null;
        error_msg: string | null; updated_at: string;
      }[] | null;
    };

  const logs = recientes ?? [];

  const tasaA = stats && stats.enviados_a > 0
    ? ((stats.convertidos_a / stats.enviados_a) * 100).toFixed(1)
    : "—";
  const tasaB = stats && stats.enviados_b > 0
    ? ((stats.convertidos_b / stats.enviados_b) * 100).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Campaña SmartBuilderEC</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pipeline SBC · segmento <code className="text-xs bg-muted px-1 rounded">ecm_b_caliente</code> · 1 contacto cada 2 s
          </p>
        </div>
        <CampanaControls
          activa={aprobacionStats?.activa ?? false}
          nivel={calcularNivel(aprobacionStats ?? { aprobados: 0, tasa_limpia: 0, automatizado: false })}
          enviadosHoy={enviadosHoy}
          pendientes={pendientes}
          ultimoLote={aprobacionStats?.ultimo_lote_at ?? null}
          umbralAuto={aprobacionStats?.umbral_auto ?? 0.92}
        />
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error cargando estadísticas: {errorMsg}
        </div>
      )}

      {/* Métricas A/B */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Enviados total" value={stats.total_enviados.toString()} />
          <MetricCard label="Workflow A (caliente)" value={`${stats.enviados_a}`} sub={`Tasa: ${tasaA}%`} accent="green" />
          <MetricCard label="Workflow B (tibio/sin hist)" value={`${stats.enviados_b}`} sub={`Tasa: ${tasaB}%`} accent="blue" />
          <MetricCard label="Negativos / Blacklist" value={stats.total_negativos.toString()} accent="red" />
        </div>
      )}

      {/* Estado de leads en ECMatic */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Estado en ECMatic</h2>
          <span className="text-xs text-muted-foreground">
            {estadosLeads.total} lead{estadosLeads.total !== 1 ? "s" : ""} en campaña
          </span>
        </div>
        <EstadosChart estados={estadosLeads} />
      </div>

      {/* Checklist de prerrequisitos */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold">Prerrequisitos antes de lanzar</p>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>
            <span className={process.env.GHL_WORKFLOW_A_ID ? "text-green-500" : "text-yellow-500"}>
              {process.env.GHL_WORKFLOW_A_ID ? "✓" : "○"}
            </span>{" "}
            GHL_WORKFLOW_A_ID — Workflow A (sbc_cierre_directo)
          </li>
          <li>
            <span className={process.env.GHL_WORKFLOW_B_ID ? "text-green-500" : "text-yellow-500"}>
              {process.env.GHL_WORKFLOW_B_ID ? "✓" : "○"}
            </span>{" "}
            GHL_WORKFLOW_B_ID — Workflow B (sbc_reactivacion)
          </li>
          <li>
            <span className={process.env.SBC_PAGO_URL ? "text-green-500" : "text-yellow-500"}>
              {process.env.SBC_PAGO_URL ? "✓" : "○"}
            </span>{" "}
            SBC_PAGO_URL — Link de pago SmartBuilderEC
          </li>
        </ul>
      </div>

      {/* Log de actividad */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Actividad reciente ({logs.length} registros)
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros todavía. Inicia la campaña para comenzar.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Nombre</th>
                  <th className="text-left p-2 font-medium">Categoría</th>
                  <th className="text-left p-2 font-medium">Variante</th>
                  <th className="text-left p-2 font-medium">Enviado</th>
                  <th className="text-left p-2 font-medium">Respuesta</th>
                  <th className="text-left p-2 font-medium">Convirtió</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.ghl_contact_id} className="hover:bg-muted/30">
                    <td className="p-2">{log.nombre ?? log.ghl_contact_id.slice(-6)}</td>
                    <td className="p-2">
                      <span className={categoriaBadgeColor(log.categoria_sbc)}>
                        {log.categoria_sbc.replace("ecm_sbc_", "")}
                      </span>
                    </td>
                    <td className="p-2">
                      {log.variante ? (
                        <span className={log.variante === "a" ? "text-green-500 font-bold" : "text-blue-500 font-bold"}>
                          {log.variante.toUpperCase()}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-2">{log.enviado ? "✓" : "—"}</td>
                    <td className="p-2">{log.respuesta_tipo ?? "—"}</td>
                    <td className="p-2">
                      {log.convirtio === true ? "✓" : log.convirtio === false ? "✗" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componentes ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: "green" | "blue" | "red";
}) {
  const color =
    accent === "green" ? "text-green-500"
    : accent === "blue" ? "text-blue-500"
    : accent === "red" ? "text-red-500"
    : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const ESTADOS_CONFIG = [
  { key: "sin_contactar",   label: "Aún no contactado",     color: "bg-slate-400",   dot: "bg-slate-400"   },
  { key: "en_espera",       label: "En espera de respuesta", color: "bg-yellow-500",  dot: "bg-yellow-500"  },
  { key: "en_conversacion", label: "En conversación",        color: "bg-blue-500",    dot: "bg-blue-500"    },
  { key: "cerrado",         label: "Cerrado",                color: "bg-green-500",   dot: "bg-green-500"   },
  { key: "inactivo",        label: "Inactivo",               color: "bg-red-400",     dot: "bg-red-400"     },
] as const;

function EstadosChart({ estados }: { estados: EstadosLeadsCampana }) {
  const total = estados.total;

  return (
    <div className="space-y-3">
      {ESTADOS_CONFIG.map(({ key, label, color, dot }) => {
        const count = estados[key];
        const pct   = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full ${color} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 text-right font-semibold">
              {count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span>
            </span>
          </div>
        );
      })}
      {total === 0 && (
        <p className="text-xs text-muted-foreground">Sin datos todavía — inicia la campaña para ver resultados.</p>
      )}
    </div>
  );
}

function categoriaBadgeColor(cat: string): string {
  if (cat.includes("caliente"))   return "text-orange-500 font-medium";
  if (cat.includes("tibio"))      return "text-yellow-500";
  if (cat.includes("ya_compro"))  return "text-green-500";
  if (cat.includes("descartado")) return "text-red-500";
  return "text-muted-foreground";
}
