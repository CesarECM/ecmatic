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

const CAMPANA    = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const TAG_FUENTE = process.env.GHL_TAG_FUENTE     ?? "ecm_b_caliente";
const CAP_DIA    = 10_000;

// CDMX = UTC-6 permanente desde 2022 (sin DST)
function horaCDMX(): number {
  const now = new Date();
  return ((now.getUTCHours() - 6) + 24) % 24 + now.getUTCMinutes() / 60;
}
function horaTexto(): string {
  return new Date().toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}


export default async function GHLCampaignPage() {
  const db   = createServiceClient() as any;
  const hora = horaCDMX();

  const KPIS_FALLBACK = { activos: 0, atascados: 0, escalados: 0, intentos_24h: 0, por_tipo: { nurturing: 0, conversational: 0, payment: 0 } };

  const [stats, aprobacionStats, enviadosHoy, pendientes, estadosLeads, logsInfo, ghlResult,
    monitorKPIs, atascados, proximos, escalados] =
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
    ]);

  const { data: logs } = await db
    .from("ghl_campana_logs")
    .select("ghl_contact_id, nombre, categoria_sbc, variante, enviado, enviado_at, respuesta_tipo, convirtio, updated_at")
    .eq("campana", CAMPANA)
    .order("updated_at", { ascending: false })
    .limit(50) as { data: LogRow[] | null };

  const nivel        = calcularNivel(aprobacionStats ?? { trust_score: 0, automatizado: false });
  const totalGHL     = ghlResult.total;
  const paginaActual = aprobacionStats?.pagina_campana ?? 1;
  const totalPaginas = totalGHL > 0 ? Math.ceil(totalGHL / nivel.tamanoLote) : 0;
  const noAlcanzados = Math.max(0, totalGHL - logsInfo.total);
  const activa       = aprobacionStats?.activa ?? false;
  const capAlcanzado = enviadosHoy >= CAP_DIA;
  const pctPool      = totalGHL > 0 ? Math.min(100, Math.round((logsInfo.total / totalGHL) * 100)) : 0;
  const pctDia       = Math.min(100, Math.round((enviadosHoy / CAP_DIA) * 100));

  // Ventanas: 09:30–19:30 mensajes nuevos · 09:00–22:00 recordatorios
  const enVentanaMensajes     = hora >= 9.5 && hora < 19.5;
  const enVentanaRecordatorios = hora >= 9   && hora < 22;

  const motivosPausaMensajes: MotivoItem[] = [
    !activa            && "Campaña desactivada manualmente",
    !enVentanaMensajes && "Fuera de horario (09:30 – 19:30 CDMX)",
    pendientes > 0     && {
      texto: `${pendientes} mensaje${pendientes > 1 ? "s" : ""} pendiente${pendientes > 1 ? "s" : ""} de aprobación`,
      href:  "/admin/aprobaciones",
    },
    capAlcanzado       && `Cap diario de ${CAP_DIA.toLocaleString()} alcanzado`,
  ].filter(Boolean) as MotivoItem[];

  const motivosPausaRecordatorios: MotivoItem[] = [
    !activa                 && "Campaña desactivada manualmente",
    !enVentanaRecordatorios && "Fuera de horario (09:00 – 22:00 CDMX)",
  ].filter(Boolean) as MotivoItem[];

  const tasaA = stats?.enviados_a  ? (stats.convertidos_a  / stats.enviados_a  * 100).toFixed(1) : "—";
  const tasaB = stats?.enviados_b  ? (stats.convertidos_b  / stats.enviados_b  * 100).toFixed(1) : "—";

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Campaña SmartBuilderEC</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Segmento <code className="text-xs bg-muted px-1 rounded">{TAG_FUENTE}</code>
            {" · "}Hora CDMX: <strong>{horaTexto()}</strong>
          </p>
        </div>
        <CampanaControls activa={activa} pendientes={pendientes} />
      </div>

      {/* ── Pool GHL ───────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pool de contactos GHL</h2>
          <span className="text-xs text-muted-foreground">
            Página {paginaActual}{totalPaginas > 0 ? ` de ${totalPaginas}` : ""} · lote {nivel.tamanoLote}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <MiniStat label="En GHL con tag"  value={totalGHL.toLocaleString("es-MX")} />
          <MiniStat label="Procesados"      value={logsInfo.total.toLocaleString("es-MX")} color="text-blue-500" />
          <MiniStat label="Sin alcanzar"    value={noAlcanzados.toLocaleString("es-MX")} color="text-muted-foreground" />
        </div>
        <Barra pct={pctPool} color={pctPool >= 100 ? "bg-green-500" : "bg-primary"} />
        <p className="text-xs text-muted-foreground">{pctPool}% del pool procesado</p>
      </div>

      {/* ── Ventanas operativas ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VentanaCard
          titulo="Mensajes nuevos"
          ventana="09:30 – 19:30 CDMX"
          activa={motivosPausaMensajes.length === 0}
          motivos={motivosPausaMensajes}
          sub={`Lote de ${nivel.tamanoLote} contactos cada ${nivel.intervaloMin} min`}
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
          <MiniStat label="Lote"          value={`${nivel.tamanoLote} contactos`} />
          <MiniStat label="Intervalo"     value={`${nivel.intervaloMin} min`} />
          <MiniStat label="Aprobados"     value={(aprobacionStats?.aprobados ?? 0).toString()} />
          <MiniStat label="Umbral IA"     value={`${Math.round((aprobacionStats?.umbral_auto ?? 0.92) * 100)}%`} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Enviados hoy</span>
            <span className={capAlcanzado ? "text-red-500 font-bold" : ""}>{enviadosHoy.toLocaleString()} / {CAP_DIA.toLocaleString()}</span>
          </div>
          <Barra pct={pctDia} color={pctDia >= 100 ? "bg-red-500" : pctDia >= 80 ? "bg-yellow-500" : "bg-primary"} />
        </div>
        {aprobacionStats?.ultimo_lote_at && (
          <p className="text-xs text-muted-foreground">
            Último lote: {new Date(aprobacionStats.ultimo_lote_at).toLocaleString("es-MX", {
              timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short",
            })}
          </p>
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
          <span className="text-xs text-muted-foreground">Total GHL: {totalGHL.toLocaleString("es-MX")}</span>
        </div>
        <EstadosChart totalGHL={totalGHL} noAlcanzados={noAlcanzados} excluidos={logsInfo.excluidos} estados={estadosLeads} />
      </div>

      {/* ── A/B ────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total enviados",      value: stats.total_enviados.toString(),  sub: undefined,          accent: undefined   },
            { label: "Workflow A",          value: stats.enviados_a.toString(),       sub: `Tasa: ${tasaA}%`, accent: "green"     },
            { label: "Workflow B",          value: stats.enviados_b.toString(),       sub: `Tasa: ${tasaB}%`, accent: "blue"      },
            { label: "Negativos",           value: stats.total_negativos.toString(),  sub: undefined,          accent: "red"       },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${accent === "green" ? "text-green-500" : accent === "blue" ? "text-blue-500" : accent === "red" ? "text-red-500" : ""}`}>
                {value}
              </p>
              {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Monitor de seguimientos ─────────────────────────────── */}
      <FollowupMonitor kpis={monitorKPIs} atascados={atascados} proximos={proximos} escalados={escalados} />

      {/* ── Log ────────────────────────────────────────────────── */}
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
  const colors = ["bg-muted text-muted-foreground", "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[nivel]}`}>{labels[nivel]}</span>;
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
            {href
              ? <a href={href} className="underline font-medium hover:opacity-80">{texto}</a>
              : texto}
          </p>
        );
      })}
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

