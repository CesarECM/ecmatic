import { createServiceClient } from "@/lib/supabase/service";
import { obtenerStatsAB } from "@/services/ab-workflows-ghl";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  obtenerEstadosLeadsCampana, contarLogsCampana,
} from "@/services/ghl-aprobacion";
import { buscarContactosPorTag } from "@/lib/ghl/contacts-api";
import {
  obtenerKPIsMonitor, obtenerAtascados,
  obtenerProximosSeguimientos, obtenerEscalados,
} from "@/services/seguimiento-monitor";
import { CampanaControls } from "./CampanaControls";
import { EstadosChart } from "./EstadosChart";
import { FollowupMonitor } from "./FollowupMonitor";
import { LogTable, type LogRow } from "./LogTable";
import { NivelesRoadmap } from "./NivelesRoadmap";

export const metadata = { title: "Campaña SBC · ECMatic" };

type MotivoItem = string | { texto: string; href: string };
export const revalidate = 0;

const CAMPANA     = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const TAG_FUENTE  = process.env.GHL_TAG_FUENTE     ?? "ecm_b_caliente";
const CAP_DIA     = 10_000;
const HRS_OP      = 10; // 9:30–19:30 CDMX

function horaCDMX(): number {
  const now = new Date();
  return ((now.getUTCHours() - 6) + 24) % 24 + now.getUTCMinutes() / 60;
}
function horaTexto(): string {
  return new Date().toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function tiempoRelativo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return "hace menos de 1 min";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "hace 1 h" : `hace ${hrs} h`;
}
function formatVelocidad(v: number): string {
  if (v <= 0) return "0 leads/min";
  if (v >= 1) return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} leads/min`;
  return `1 lead / ${(1 / v).toFixed(1)} min`;
}

type EstadoClaudeAPI = "operativa" | "sin_creditos" | "error" | "timeout" | "sin_datos";

async function obtenerEstadoClaudeAPI(db: any): Promise<{ estado: EstadoClaudeAPI; hace: string | null }> {
  const { data } = await db
    .from("log_sistema")
    .select("fase, resultado, created_at")
    .eq("categoria", "ia")
    .in("fase", ["respuesta", "error", "timeout"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { fase: string; resultado: string | null; created_at: string } | null };
  if (!data) return { estado: "sin_datos", hace: null };
  const hace = new Date(data.created_at).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  if (data.fase === "respuesta") return { estado: "operativa", hace };
  if (data.fase === "timeout")   return { estado: "timeout",   hace };
  if (data.fase === "error" && data.resultado?.includes("credit balance"))
    return { estado: "sin_creditos", hace };
  return { estado: "error", hace };
}

// S7: últimos N envíos exitosos del cron auto-disparo
async function obtenerHistorialEnvios(db: any): Promise<number[]> {
  const { data } = await db
    .from("log_sistema")
    .select("resultado")
    .eq("tipo_accion", "ghl_campana.auto")
    .eq("fase", "ok")
    .order("created_at", { ascending: false })
    .limit(12) as { data: { resultado: string | null }[] | null };
  if (!data?.length) return [];
  return data
    .map((r) => { const m = r.resultado?.match(/enviados:(\d+)/); return m ? parseInt(m[1]) : 0; })
    .reverse();
}

export default async function GHLCampaignPage() {
  const db   = createServiceClient() as any;
  const hora = horaCDMX();

  const KPIS_FALLBACK = { activos: 0, atascados: 0, escalados: 0, intentos_24h: 0, por_tipo: { nurturing: 0, conversational: 0, payment: 0, demo_agendado: 0 } };

  const [stats, aprobacionStats, enviadosHoy, pendientes, estadosLeads, logsInfo, ghlResult,
    monitorKPIs, atascados, proximos, escalados, claudeEstado, historialEnvios] =
    await Promise.all([
      obtenerStatsAB(CAMPANA).catch(() => null),
      obtenerStatsAprobacion(CAMPANA),
      contarEnviadosHoy(CAMPANA),
      contarPendientes(CAMPANA),
      obtenerEstadosLeadsCampana(CAMPANA),
      contarLogsCampana(CAMPANA),
      buscarContactosPorTag(TAG_FUENTE, 1, 1).catch(() => ({ contacts: [], total: 0 })),
      obtenerKPIsMonitor().catch(() => KPIS_FALLBACK),
      obtenerAtascados().catch(() => []),
      obtenerProximosSeguimientos().catch(() => []),
      obtenerEscalados().catch(() => []),
      obtenerEstadoClaudeAPI(db).catch(() => ({ estado: "sin_datos" as EstadoClaudeAPI, hace: null })),
      obtenerHistorialEnvios(db).catch(() => [] as number[]),
    ]);

  const { data: logs } = await db
    .from("ghl_campana_logs")
    .select("ghl_contact_id, nombre, categoria_sbc, variante, enviado, enviado_at, respuesta_tipo, convirtio, updated_at")
    .eq("campana", CAMPANA)
    .order("updated_at", { ascending: false })
    .limit(50) as { data: LogRow[] | null };

  // ── Velocidad y freno ──────────────────────────────────────────────────────
  const nivel             = calcularNivel(aprobacionStats ?? { trust_score: 0, automatizado: false });
  const factorFreno       = Math.max(0, (10 - pendientes) / 10);
  const velocidadEfectiva = nivel.velocidadLeadsPorMin * factorFreno;
  const leadsPerRun       = Math.max(1, Math.round(nivel.velocidadLeadsPorMin * 5));
  const accActual         = aprobacionStats?.leads_acumulados ?? 0;

  // ── Pool ──────────────────────────────────────────────────────────────────
  const totalGHL     = ghlResult.total;
  const paginaActual = aprobacionStats?.pagina_campana ?? 1;
  const totalPaginas = totalGHL > 0 ? Math.ceil(totalGHL / leadsPerRun) : 0;
  const noAlcanzados = Math.max(0, totalGHL - logsInfo.total);
  const pctPool      = totalGHL > 0 ? Math.min(100, Math.round((logsInfo.total / totalGHL) * 100)) : 0;

  // S1: ETA de completitud
  const leadsPerDiaEfectivo = velocidadEfectiva * 60 * HRS_OP;
  const etaDias = leadsPerDiaEfectivo > 0 ? Math.ceil(noAlcanzados / leadsPerDiaEfectivo) : null;

  // ── Cap diario ────────────────────────────────────────────────────────────
  const activa       = aprobacionStats?.activa ?? false;
  const capAlcanzado = enviadosHoy >= CAP_DIA;
  const capEnRiesgo  = !capAlcanzado && enviadosHoy >= CAP_DIA * 0.8;
  const pctDia       = Math.min(100, Math.round((enviadosHoy / CAP_DIA) * 100));

  // S3: Proyección de cierres
  const tasaAnum = stats?.enviados_a ? stats.convertidos_a / stats.enviados_a : 0;
  const tasaBnum = stats?.enviados_b ? stats.convertidos_b / stats.enviados_b : 0;
  const tasaMejor = Math.max(tasaAnum, tasaBnum);
  const proyeccionCierres = noAlcanzados > 0 && tasaMejor > 0
    ? Math.round(noAlcanzados * tasaMejor) : null;

  // S8: Tasa de engagement
  const respondieron    = estadosLeads.en_espera + estadosLeads.en_conversacion + estadosLeads.cerrado + estadosLeads.inactivo;
  const tasaEngagement  = estadosLeads.total > 0 ? respondieron / estadosLeads.total : 0;

  const enVentanaMensajes      = hora >= 9.5 && hora < 19.5;
  const enVentanaRecordatorios = hora >= 9   && hora < 22;

  const tasaA = stats?.enviados_a ? (stats.convertidos_a / stats.enviados_a * 100).toFixed(1) : "—";
  const tasaB = stats?.enviados_b ? (stats.convertidos_b / stats.enviados_b * 100).toFixed(1) : "—";

  const motivosPausaMensajes: MotivoItem[] = [
    !activa            && "Campaña desactivada manualmente",
    !enVentanaMensajes && "Fuera de horario (09:30 – 19:30 CDMX)",
    pendientes >= 10   && { texto: `Freno máximo — ${pendientes} pendientes sin revisar`, href: "/admin/aprobaciones" },
    capAlcanzado       && `Cap diario de ${CAP_DIA.toLocaleString()} alcanzado`,
  ].filter(Boolean) as MotivoItem[];

  const motivosPausaRecordatorios: MotivoItem[] = [
    !activa                 && "Campaña desactivada manualmente",
    !enVentanaRecordatorios && "Fuera de horario (09:00 – 22:00 CDMX)",
  ].filter(Boolean) as MotivoItem[];

  const maxHistorial = historialEnvios.length > 0 ? Math.max(...historialEnvios, 1) : 1;

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Campaña SmartBuilderEC</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Segmento <code className="text-xs bg-muted px-1 rounded">{TAG_FUENTE}</code>
            {" · "}Hora CDMX: <strong>{horaTexto()}</strong>
            {/* S10: tiempo desde último envío */}
            {aprobacionStats?.ultimo_lote_at && (
              <span className="ml-2 text-muted-foreground/70">
                · último envío {tiempoRelativo(aprobacionStats.ultimo_lote_at)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ClaudeBadge estado={claudeEstado.estado} hace={claudeEstado.hace} />
          <CampanaControls activa={activa} pendientes={pendientes} />
        </div>
      </div>

      {/* S6: Banner de pendientes prominente ──────────────────────────────── */}
      {pendientes > 0 && (
        <div className={`rounded-lg border p-4 flex items-center justify-between gap-4 flex-wrap
          ${pendientes >= 10
            ? "border-red-500/40 bg-red-500/5"
            : "border-yellow-500/40 bg-yellow-500/5"}`}
        >
          <div>
            <p className={`text-sm font-semibold ${pendientes >= 10 ? "text-red-600 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"}`}>
              {pendientes >= 10
                ? `Campaña detenida — ${pendientes} mensajes esperando revisión`
                : `Freno ${Math.round((1 - factorFreno) * 100)}% activo — ${pendientes} mensaje${pendientes !== 1 ? "s" : ""} pendiente${pendientes !== 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendientes >= 10
                ? "Velocidad = 0 leads/min hasta que bajes de 10 pendientes."
                : `Velocidad reducida a ${formatVelocidad(velocidadEfectiva)}. Revisa para liberar el freno.`}
            </p>
          </div>
          <a
            href="/admin/aprobaciones"
            className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white transition-colors
              ${pendientes >= 10 ? "bg-red-500 hover:bg-red-600" : "bg-yellow-500 hover:bg-yellow-600"}`}
          >
            Resolver {pendientes} pendiente{pendientes !== 1 ? "s" : ""} →
          </a>
        </div>
      )}

      {/* ── Pool GHL ───────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pool de contactos GHL</h2>
          <span className="text-xs text-muted-foreground">
            Página {paginaActual}{totalPaginas > 0 ? ` de ${totalPaginas}` : ""} · ~{leadsPerRun}/run
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <MiniStat label="En GHL con tag" value={totalGHL.toLocaleString("es-MX")} />
          <MiniStat label="Procesados"     value={logsInfo.total.toLocaleString("es-MX")} color="text-blue-500" />
          {/* R5: "Por procesar" en azul neutro */}
          <MiniStat label="Por procesar"   value={noAlcanzados.toLocaleString("es-MX")} color="text-sky-500" />
        </div>
        <Barra pct={pctPool} color={pctPool >= 100 ? "bg-green-500" : "bg-primary"} />
        {/* S1: ETA */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pctPool}% del pool procesado</span>
          {etaDias !== null && noAlcanzados > 0 && (
            <span>
              {etaDias === 0
                ? "Pool casi completo"
                : etaDias === 1
                ? "ETA: ~1 día al ritmo actual"
                : `ETA: ~${etaDias} días al ritmo actual`}
            </span>
          )}
          {etaDias === null && noAlcanzados > 0 && (
            <span className="text-orange-500">ETA: indefinida (velocidad = 0)</span>
          )}
        </div>
      </div>

      {/* ── Ventanas operativas ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VentanaCard
          titulo="Mensajes nuevos"
          ventana="09:30 – 19:30 CDMX"
          activa={motivosPausaMensajes.length === 0}
          motivos={motivosPausaMensajes}
          sub={pendientes === 0
            ? formatVelocidad(nivel.velocidadLeadsPorMin)
            : `${formatVelocidad(velocidadEfectiva)} efectivos · freno ${Math.round((1 - factorFreno) * 100)}% (${pendientes} pendiente${pendientes !== 1 ? "s" : ""})`}
        />
        <VentanaCard
          titulo="Recordatorios de seguimiento"
          ventana="09:00 – 22:00 CDMX"
          activa={motivosPausaRecordatorios.length === 0}
          motivos={motivosPausaRecordatorios}
          sub="Cron cada 30 min — detecta silencios y envía follow-ups"
        />
      </div>

      {/* ── Velocidad y confianza ───────────────────────────────── */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Velocidad y nivel de confianza</h2>
          <NivelBadge nivel={nivel.nivel} />
        </div>
        <p className="text-xs text-muted-foreground">{nivel.descripcion}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <MiniStat label="Velocidad base"     value={formatVelocidad(nivel.velocidadLeadsPorMin)} />
          {/* R10: naranja en lugar de rojo para freno=0 */}
          <MiniStat label="Velocidad efectiva" value={formatVelocidad(velocidadEfectiva)}
            color={factorFreno < 1 ? (factorFreno === 0 ? "text-orange-500" : "text-yellow-500") : ""} />
          <MiniStat label="Aprobados"          value={(aprobacionStats?.aprobados ?? 0).toString()} />
          <MiniStat label="Umbral IA"          value={`${Math.round((aprobacionStats?.umbral_auto ?? 0.92) * 100)}%`} />
        </div>

        {/* Barra de freno */}
        {pendientes > 0 && pendientes < 10 && (
          <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-yellow-400 transition-all"
                style={{ width: `${Math.round((1 - factorFreno) * 100)}%` }} />
            </div>
            <span className="shrink-0">
              Freno {Math.round((1 - factorFreno) * 100)}% · {pendientes} pendiente{pendientes !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* S2: Acumulador de tokens visible */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Acumulando: <span className="font-semibold text-foreground tabular-nums">{accActual.toFixed(2)}</span>
            <span className="text-muted-foreground"> / {leadsPerRun} → próximo run</span>
          </span>
          <span className="text-right">
            {accActual >= 1
              ? <span className="text-green-600 dark:text-green-400 font-medium">listo para enviar</span>
              : <span>{Math.round((accActual / leadsPerRun) * 100)}% del próximo lote</span>}
          </span>
        </div>

        {/* Cap diario */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Enviados hoy</span>
            <span className={capAlcanzado ? "text-red-500 font-bold" : capEnRiesgo ? "text-yellow-500 font-medium" : ""}>
              {enviadosHoy.toLocaleString()} / {CAP_DIA.toLocaleString()}
              {/* S5: alerta anticipada al 80% */}
              {capEnRiesgo && " — ⚠ cerca del límite"}
            </span>
          </div>
          <Barra pct={pctDia} color={pctDia >= 100 ? "bg-red-500" : pctDia >= 80 ? "bg-yellow-500" : "bg-primary"} />
        </div>

        {/* S7: Sparkline de últimos runs */}
        {historialEnvios.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Historial de envíos — últimos {historialEnvios.length} runs</p>
            <div className="flex items-end gap-0.5 h-7">
              {historialEnvios.map((v, i) => (
                <div
                  key={i}
                  title={`${v} leads`}
                  className="flex-1 rounded-sm bg-primary/50 hover:bg-primary transition-colors"
                  style={{ height: `${Math.max(3, Math.round((v / maxHistorial) * 28))}px` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>más antiguo</span>
              <span>ahora</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Hoja de ruta ───────────────────────────────────────── */}
      <NivelesRoadmap
        nivelActual={nivel.nivel}
        trustScore={aprobacionStats?.trust_score ?? 0}
        decisionsWindow={aprobacionStats?.decisions_window ?? []}
        windowSize={aprobacionStats?.window_size ?? 20}
        lastDecisionAt={aprobacionStats?.last_decision_at ?? null}
        automatizado={aprobacionStats?.automatizado ?? false}
        aprobadosTotal={aprobacionStats?.aprobados ?? 0}
        tasaLimpia={aprobacionStats?.tasa_limpia ?? 0}
      />

      {/* ── Estado de leads ─────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Estado de leads en campaña</h2>
          {/* S8: tasa de engagement */}
          {estadosLeads.total > 0 && (
            <span className="text-xs text-muted-foreground">
              Engagement: <span className="font-semibold text-foreground">{Math.round(tasaEngagement * 100)}%</span>
              <span className="ml-1 text-muted-foreground/70">({respondieron}/{estadosLeads.total} respondieron)</span>
            </span>
          )}
        </div>
        <EstadosChart totalGHL={totalGHL} noAlcanzados={noAlcanzados} excluidos={logsInfo.excluidos} estados={estadosLeads} />
      </div>

      {/* R9: A/B — siempre renderizar, con estado vacío si no hay datos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total enviados", value: stats?.total_enviados.toString() ?? "—",  sub: undefined,               accent: undefined },
          { label: "Workflow A",     value: stats?.enviados_a.toString()     ?? "—",  sub: stats ? `Tasa: ${tasaA}%` : "Sin datos", accent: "green" },
          { label: "Workflow B",     value: stats?.enviados_b.toString()     ?? "—",  sub: stats ? `Tasa: ${tasaB}%` : "Sin datos", accent: "blue"  },
          {
            label: "Proyección cierre",
            value: proyeccionCierres !== null ? `~${proyeccionCierres}` : "—",
            sub:   proyeccionCierres !== null ? `si tasa ${(tasaMejor * 100).toFixed(1)}% se mantiene` : "Sin historial A/B",
            accent: "emerald",
          },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className="rounded-lg border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${
              accent === "green"   ? "text-green-500"   :
              accent === "blue"    ? "text-blue-500"    :
              accent === "emerald" ? "text-emerald-500" :
              accent === "red"     ? "text-red-500"     : ""}`}>
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Monitor de seguimientos ─────────────────────────────── */}
      <FollowupMonitor kpis={monitorKPIs} atascados={atascados} proximos={proximos} escalados={escalados} />

      {/* ── Log — colapsable en LogTable ───────────────────────── */}
      <LogTable logs={logs ?? []} />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function MiniStat({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function NivelBadge({ nivel }: { nivel: 0 | 1 | 2 | 3 | 4 }) {
  const labels = ["Nivel 0 — Inicio", "Nivel 1 — Rodaje", "Nivel 2 — Confianza media", "Nivel 3 — Alta confianza", "Nivel 4 — Plena confianza"];
  const colors = ["bg-muted text-muted-foreground",
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[nivel]}`}>{labels[nivel]}</span>;
}

function ClaudeBadge({ estado, hace }: { estado: EstadoClaudeAPI; hace: string | null }) {
  const cfg: Record<EstadoClaudeAPI, { label: string; color: string; dot: string; href?: string }> = {
    operativa:    { label: "IA operativa",  color: "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30",     dot: "bg-green-500" },
    sin_creditos: { label: "Sin créditos",  color: "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30",             dot: "bg-red-500",  href: "https://console.anthropic.com/settings/billing" },
    error:        { label: "Error en IA",   color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30", dot: "bg-orange-500" },
    timeout:      { label: "IA lenta",      color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30", dot: "bg-yellow-500" },
    sin_datos:    { label: "IA sin datos",  color: "bg-muted text-muted-foreground border border-border",                               dot: "bg-muted-foreground" },
  };
  const { label, color, dot, href } = cfg[estado];
  const inner = (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${estado === "operativa" ? "animate-pulse" : ""}`} />
      {label}
      {hace && <span className="font-normal opacity-70">· {hace}</span>}
    </span>
  );
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" title="Ir a Anthropic Billing">{inner}</a>
    : inner;
}

function VentanaCard({ titulo, ventana, activa, motivos, sub }: {
  titulo: string; ventana: string; activa: boolean; motivos: MotivoItem[]; sub: string;
}) {
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${activa ? "border-green-500/40 bg-green-500/5" : "border-yellow-500/40 bg-yellow-500/5"}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{titulo}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activa ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"}`}>
          {activa ? "ACTIVO" : "EN PAUSA"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Ventana: <strong>{ventana}</strong></p>
      {motivos.map((m) => {
        const texto = typeof m === "string" ? m : m.texto;
        const href  = typeof m === "string" ? null : m.href;
        return (
          <p key={texto} className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
            <span>⏸</span>
            {href ? <a href={href} className="underline font-medium hover:opacity-80">{texto}</a> : texto}
          </p>
        );
      })}
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
