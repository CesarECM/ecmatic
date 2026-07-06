import { createServiceClient } from "@/lib/supabase/service";
import { obtenerStatsAB } from "@/services/ab-workflows-ghl";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  obtenerEstadosLeadsCampana, contarLogsCampana,
  contarResolucionesRecientes, obtenerUltimoEncoladoAt,
} from "@/services/ghl-aprobacion";
import {
  calcularFactorMomento, calcularFactorTurbo,
  MOMENTUM_WINDOW_H, MOMENTUM_CAP, MAX_MOMENTUM_BOOST,
  TURBO_RAMP_MIN, MAX_TURBO_BOOST, TURBO_MIN_RESOLUCIONES,
} from "@/lib/ghl/trust-score";
import { buscarContactosPorTag } from "@/lib/ghl/contacts-api";
import { obtenerKPIsMonitor } from "@/services/seguimiento-monitor";
import { CampanaControls } from "./CampanaControls";
import { EstadosChart } from "./EstadosChart";
import { FollowupMonitor } from "./FollowupMonitor";
import { LogTable, type LogRow } from "./LogTable";
import { NivelesRoadmap } from "./NivelesRoadmap";
import { AuditoriaEntregas } from "./AuditoriaEntregas";
import { contarCandidatosAuditoria } from "@/services/ghl-auditoria-entregas";
import { AlertasWebhook, type AlertasWebhookData } from "./AlertasWebhook";
import { obtenerConfig } from "@/services/sistema";
import { IAToggle } from "./IAToggle";

export const metadata = { title: "Campaña SBC · ECMatic" };

type MotivoItem = string | { texto: string; href: string };
export const revalidate = 0;

const CAMPANA         = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const TAG_FUENTE      = process.env.GHL_TAG_FUENTE     ?? "ecm_b_caliente";
const SINCE_AUDITORIA = "2026-06-28T00:00:00Z"; // inicio campaña sbc_jun26
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

interface DiagnosticoIA {
  estado: EstadoClaudeAPI;
  hace: string | null;
  mensaje: string | null;
  tarea: string | null;
  errorCompleto: string | null;
  ultimosErrores: Array<{ tarea: string; resultado: string | null; errorMsg: string | null; hace: string }>;
}

async function obtenerEstadoClaudeAPI(db: any): Promise<DiagnosticoIA> {
  const [{ data }, { data: errores }] = await Promise.all([
    db.from("log_sistema")
      .select("fase, resultado, created_at, tipo_accion, metadata")
      .eq("categoria", "ia")
      .in("fase", ["respuesta", "error", "timeout"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: { fase: string; resultado: string | null; created_at: string; tipo_accion: string; metadata: Record<string, unknown> } | null }>,
    db.from("log_sistema")
      .select("tipo_accion, resultado, created_at, metadata")
      .eq("categoria", "ia")
      .in("fase", ["error", "timeout"])
      .order("created_at", { ascending: false })
      .limit(5) as Promise<{ data: Array<{ tipo_accion: string; resultado: string | null; created_at: string; metadata: Record<string, unknown> }> | null }>,
  ]);

  const fallback: DiagnosticoIA = { estado: "sin_datos", hace: null, mensaje: null, tarea: null, errorCompleto: null, ultimosErrores: [] };
  if (!data) return fallback;

  const hace = new Date(data.created_at).toLocaleTimeString("es-MX", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const tarea        = data.tipo_accion ?? null;
  const errorCompleto = (data.metadata?.error_message as string | null) ?? null;
  const ultimosErrores = (errores ?? []).map(e => ({
    tarea:     e.tipo_accion,
    resultado: e.resultado,
    errorMsg:  (e.metadata?.error_message as string | null) ?? null,
    hace:      new Date(e.created_at).toLocaleTimeString("es-MX", {
      timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false,
    }),
  }));

  if (data.fase === "respuesta") return { estado: "operativa", hace, mensaje: null, tarea, errorCompleto: null, ultimosErrores: [] };
  if (data.fase === "timeout")   return { estado: "timeout",   hace, mensaje: data.resultado ?? null, tarea, errorCompleto, ultimosErrores };
  if (data.fase === "error" && data.resultado?.includes("credit balance"))
    return { estado: "sin_creditos", hace, mensaje: null, tarea, errorCompleto, ultimosErrores };
  return { estado: "error", hace, mensaje: data.resultado ?? null, tarea, errorCompleto, ultimosErrores };
}

function interpretarError(mensaje: string | null, errorCompleto: string | null): string | null {
  const txt = (errorCompleto ?? mensaje ?? "").toLowerCase();
  if (!txt) return null;
  if (txt.includes("credit balance") || txt.includes("credit"))  return "Saldo Anthropic agotado — recarga en console.anthropic.com/settings/billing";
  if (txt.includes("529") || txt.includes("overloaded"))         return "API de Anthropic sobrecargada — reintentar en unos minutos";
  if (txt.includes("429") || txt.includes("rate_limit"))         return "Límite de requests por minuto alcanzado — se normalizará solo";
  if (txt.includes("401") || txt.includes("authentication"))     return "API key inválida o revocada — verifica ANTHROPIC_API_KEY en Vercel";
  if (txt.includes("404") || txt.includes("not_found"))          return "Modelo no encontrado — el model ID puede estar desactualizado";
  if (txt.includes("timeout") || txt.includes("timeout_60000"))  return "Sin respuesta en 60 s — Anthropic puede estar lento o hubo un problema de red";
  if (txt.includes("fetch failed") || txt.includes("econnreset") || txt.includes("network")) return "Error de red — verifica conectividad del servidor Vercel";
  if (txt.includes("500") || txt.includes("api_error") || txt.includes("internal")) return "Error interno de Anthropic — suele ser temporal";
  if (txt.includes("invalid_request") || txt.includes("400"))    return "Petición inválida — posible contexto demasiado largo o parámetros incorrectos";
  return null;
}

async function obtenerAlertasWebhook(db: any, enHorarioOp: boolean): Promise<AlertasWebhookData> {
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: errBuf },
    { count: errMotor },
    { count: fueraCamp },
    { count: cuerpoVacio },
    { data: ultimoWh },
  ] = await Promise.all([
    db.from("log_sistema").select("*", { count: "exact", head: true })
      .eq("tipo_accion", "ghl_buffer.procesar").eq("fase", "error").gte("created_at", desde24h),
    db.from("log_sistema").select("*", { count: "exact", head: true })
      .eq("tipo_accion", "ghl_sbc.motor").eq("fase", "error").gte("created_at", desde24h),
    db.from("log_sistema").select("*", { count: "exact", head: true })
      .eq("tipo_accion", "ghl_sbc.fuera_campana").gte("created_at", desde24h),
    db.from("log_sistema").select("*", { count: "exact", head: true })
      .eq("tipo_accion", "ghl_buffer.cuerpo_vacio").gte("created_at", desde24h),
    db.from("log_sistema").select("created_at")
      .eq("tipo_accion", "webhook.ghl.raw")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const minutosDesdeWebhook = ultimoWh?.created_at
    ? Math.floor((Date.now() - new Date(ultimoWh.created_at).getTime()) / 60_000)
    : null;

  return {
    erroresBuffer24h:    errBuf    ?? 0,
    erroresMotorIA24h:   errMotor  ?? 0,
    fueraCampana24h:     fueraCamp ?? 0,
    cuerpoVacio24h:      cuerpoVacio ?? 0,
    minutosDesdeWebhook,
    enHorarioOperativo:  enHorarioOp,
  };
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

  const enHorarioOperativo = hora >= 9.5 && hora < 22;

  const [stats, aprobacionStats, enviadosHoy, pendientes, estadosLeads, logsInfo, ghlResult,
    monitorKPIs, claudeEstado, historialEnvios, resolucionesRecientes,
    ultimoEncoladoAt, candidatosAuditoria, alertasWebhook, sistemaCfg] =
    await Promise.all([
      obtenerStatsAB(CAMPANA).catch(() => null),
      obtenerStatsAprobacion(CAMPANA),
      contarEnviadosHoy(CAMPANA),
      contarPendientes(CAMPANA),
      obtenerEstadosLeadsCampana(CAMPANA),
      contarLogsCampana(CAMPANA),
      buscarContactosPorTag(TAG_FUENTE, 1, 1).catch(() => ({ contacts: [], total: 0 })),
      obtenerKPIsMonitor().catch(() => KPIS_FALLBACK),
      obtenerEstadoClaudeAPI(db).catch(() => ({ estado: "sin_datos" as EstadoClaudeAPI, hace: null, mensaje: null, tarea: null, errorCompleto: null, ultimosErrores: [] })),
      obtenerHistorialEnvios(db).catch(() => [] as number[]),
      contarResolucionesRecientes(CAMPANA).catch(() => 0),
      obtenerUltimoEncoladoAt(CAMPANA).catch(() => null),
      contarCandidatosAuditoria(SINCE_AUDITORIA).catch(() => 0),
      obtenerAlertasWebhook(db, enHorarioOperativo).catch(() => ({
        erroresBuffer24h: 0, erroresMotorIA24h: 0,
        fueraCampana24h: 0, cuerpoVacio24h: 0,
        minutosDesdeWebhook: null, enHorarioOperativo,
      } satisfies AlertasWebhookData)),
      obtenerConfig().catch(() => ({ modo_operacion: "seguro_automatico" as const, umbral_confianza: 0.9, id: "", updated_at: "", updated_by: null })),
    ]);

  const iaConectada = sistemaCfg.modo_operacion !== "seguro";

  // ── Diagnóstico de errores silenciosos ────────────────────────────────────
  // Verifica env vars y los últimos logs del cron para detectar fallos que no
  // se manifiestan visualmente en el resto del panel.
  const workflowAOk = !!process.env.GHL_WORKFLOW_A_ID;
  const workflowBOk = !!process.env.GHL_WORKFLOW_B_ID;

  const { data: ultimosCronLogs } = await db
    .from("log_sistema")
    .select("fase, resultado, created_at")
    .eq("tipo_accion", "ghl_campana.auto")
    .in("fase", ["ok", "error"])
    .order("created_at", { ascending: false })
    .limit(6) as { data: { fase: string; resultado: string | null; created_at: string }[] | null };

  let cronErrorConsecutivos = 0;
  let ultimoCronError: string | null = null;
  let ultimoCronErrorHace: string | null = null;
  for (const log of ultimosCronLogs ?? []) {
    if (log.fase !== "error") break;
    cronErrorConsecutivos++;
    if (cronErrorConsecutivos === 1) {
      ultimoCronError = log.resultado;
      const mins = Math.floor((Date.now() - new Date(log.created_at).getTime()) / 60_000);
      ultimoCronErrorHace = mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins / 60)} h`;
    }
  }

  const hayErrorSilencioso = !workflowAOk || !workflowBOk || cronErrorConsecutivos >= 2;

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
  const factorMomento     = calcularFactorMomento(resolucionesRecientes);
  const minutosSinEncolar = ultimoEncoladoAt
    ? (Date.now() - ultimoEncoladoAt.getTime()) / 60_000
    : 0;
  const factorTurbo       = calcularFactorTurbo(minutosSinEncolar, pendientes, resolucionesRecientes);
  const velocidadFinal    = velocidadEfectiva * (1 + factorMomento + factorTurbo);
  const hayMomento        = factorMomento > 0;
  const hayTurbo          = factorTurbo > 0;
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
          <div className="flex flex-col items-end gap-1">
            <ClaudeBadge estado={claudeEstado.estado} hace={claudeEstado.hace} mensaje={claudeEstado.mensaje} />
            <IAToggle iaConectada={iaConectada} />
          </div>
          <CampanaControls activa={activa} pendientes={pendientes} />
        </div>
      </div>

      {/* ── Banner de error silencioso ─────────────────────────────── */}
      {hayErrorSilencioso && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/8 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            Error silencioso — los WhatsApp no están saliendo
          </p>
          {!workflowAOk && (
            <p className="text-xs text-red-600 dark:text-red-400">
              · <code className="bg-red-500/10 px-1 rounded">GHL_WORKFLOW_A_ID</code> no está configurado en Vercel
            </p>
          )}
          {!workflowBOk && (
            <p className="text-xs text-red-600 dark:text-red-400">
              · <code className="bg-red-500/10 px-1 rounded">GHL_WORKFLOW_B_ID</code> no está configurado en Vercel
            </p>
          )}
          {cronErrorConsecutivos >= 2 && ultimoCronError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              · Cron falló {cronErrorConsecutivos} veces seguidas
              {ultimoCronErrorHace && <span className="text-muted-foreground"> ({ultimoCronErrorHace})</span>}
              {": "}<code className="bg-red-500/10 px-1 rounded text-[11px]">{ultimoCronError.slice(0, 140)}</code>
            </p>
          )}
          <p className="text-xs text-muted-foreground pt-0.5">
            Verifica las variables de entorno en Vercel y que los workflows A/B estén activos en GHL.
          </p>
        </div>
      )}

      {/* ── Alertas de webhook / procesamiento de mensajes ─────────── */}
      <AlertasWebhook datos={alertasWebhook} />

      {/* ── Diagnóstico de IA ──────────────────────────────────────── */}
      {(claudeEstado.estado === "error" || claudeEstado.estado === "timeout" || claudeEstado.estado === "sin_datos") && (() => {
        const interpretacion = interpretarError(claudeEstado.mensaje, claudeEstado.errorCompleto);
        const colorBorder = claudeEstado.estado === "sin_datos" ? "border-muted" : "border-orange-500/40";
        const colorBg     = claudeEstado.estado === "sin_datos" ? "bg-muted/30"  : "bg-orange-500/5";
        const colorTitle  = claudeEstado.estado === "sin_datos" ? "text-muted-foreground" : "text-orange-700 dark:text-orange-400";
        return (
          <div className={`rounded-lg border ${colorBorder} ${colorBg} p-4 space-y-3`}>
            <p className={`text-sm font-semibold ${colorTitle}`}>
              Diagnóstico IA —{" "}
              {claudeEstado.estado === "sin_datos" ? "Sin registros de llamadas IA" :
               claudeEstado.estado === "timeout"   ? "Timeout (sin respuesta en 60 s)" :
               "Error en última llamada"}
              {claudeEstado.hace && <span className="font-normal opacity-70 ml-1">· {claudeEstado.hace}</span>}
            </p>

            {claudeEstado.tarea && (
              <p className="text-xs text-muted-foreground">
                Tarea: <code className="bg-muted px-1 rounded text-[11px]">{claudeEstado.tarea}</code>
              </p>
            )}

            {/* Mensaje de error completo */}
            {(claudeEstado.errorCompleto ?? claudeEstado.mensaje) && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Mensaje de error</p>
                <pre className="text-[11px] bg-muted/60 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {claudeEstado.errorCompleto ?? claudeEstado.mensaje}
                </pre>
              </div>
            )}

            {/* Interpretación automática */}
            {interpretacion && (
              <div className="rounded border border-blue-400/30 bg-blue-500/5 px-3 py-2">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <span className="font-semibold">Posible causa:</span> {interpretacion}
                </p>
              </div>
            )}

            {/* Últimos 5 errores */}
            {claudeEstado.ultimosErrores.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">
                  Últimos {claudeEstado.ultimosErrores.length} errores
                </p>
                <div className="space-y-1">
                  {claudeEstado.ultimosErrores.map((e, i) => (
                    <div key={i} className="rounded border bg-muted/40 px-2.5 py-1.5 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-[10px] bg-muted px-1 rounded">{e.tarea}</code>
                        <span className="text-muted-foreground shrink-0">{e.hace}</span>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground break-words">
                        {(e.errorMsg ?? e.resultado ?? "sin mensaje").slice(0, 200)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {claudeEstado.estado === "sin_datos" && (
              <p className="text-xs text-muted-foreground">
                No hay registros de llamadas IA en la BD. El webhook puede no estar recibiendo mensajes, o la IA no ha sido invocada recientemente.
              </p>
            )}
          </div>
        );
      })()}

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
          <MiniStat
            label="Velocidad final"
            value={formatVelocidad(velocidadFinal)}
            color={
              hayMomento           ? "text-emerald-500" :
              factorFreno === 0    ? "text-orange-500"  :
              factorFreno < 1      ? "text-yellow-500"  : ""
            }
          />
          <MiniStat label="Aprobados"          value={(aprobacionStats?.aprobados ?? 0).toString()} />
          <MiniStat label="Umbral IA"          value={`${Math.round((aprobacionStats?.umbral_auto ?? 0.92) * 100)}%`} />
        </div>

        {/* MPS-24 S87: Banner de impulso por actividad reciente */}
        {hayMomento && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/8 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Impulso activo — {resolucionesRecientes} revisión{resolucionesRecientes !== 1 ? "es" : ""} en las últimas {MOMENTUM_WINDOW_H}h
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                +{Math.round(factorMomento * 100)}% de velocidad
                {" · "}
                {formatVelocidad(velocidadEfectiva)} → <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatVelocidad(velocidadFinal)}</span>
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="w-24 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round((factorMomento / MAX_MOMENTUM_BOOST) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(resolucionesRecientes)}/{MOMENTUM_CAP} para impulso máx
              </span>
            </div>
          </div>
        )}

        {/* MPS-24 S87-T: Banner de turbo — cola vacía + admin a ritmo máximo */}
        {hayTurbo && (
          <div className="rounded-md border border-orange-500/40 bg-orange-500/8 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                ⚡ Turbo activo — cola vacía hace {Math.round(minutosSinEncolar)} min
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                +{Math.round(factorTurbo * 100)}% adicional
                {" · "}
                velocidad final{" "}
                <span className="text-orange-600 dark:text-orange-400 font-medium">{formatVelocidad(velocidadFinal)}</span>
                {" "}({(1 + factorMomento + factorTurbo).toFixed(1)}× base)
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="w-24 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-orange-500 transition-all"
                  style={{ width: `${Math.round((factorTurbo / MAX_TURBO_BOOST) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(minutosSinEncolar)}/{TURBO_RAMP_MIN} min para turbo máx
              </span>
            </div>
          </div>
        )}
        {/* Turbo disponible pero esperando ritmo máximo */}
        {!hayTurbo && pendientes === 0 && resolucionesRecientes > 0 && resolucionesRecientes < TURBO_MIN_RESOLUCIONES && (
          <p className="text-[11px] text-muted-foreground">
            Turbo disponible con {TURBO_MIN_RESOLUCIONES - resolucionesRecientes} revisión{TURBO_MIN_RESOLUCIONES - resolucionesRecientes !== 1 ? "es" : ""} más en las últimas {MOMENTUM_WINDOW_H}h
          </p>
        )}

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
      <FollowupMonitor kpis={monitorKPIs} />

      {/* ── Auditoría de entregas ───────────────────────────────── */}
      <AuditoriaEntregas totalCandidatos={candidatosAuditoria} since={SINCE_AUDITORIA} />

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

function ClaudeBadge({ estado, hace, mensaje }: { estado: EstadoClaudeAPI; hace: string | null; mensaje?: string | null }) {
  const cfg: Record<EstadoClaudeAPI, { label: string; color: string; dot: string; href?: string }> = {
    operativa:    { label: "IA operativa",  color: "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30",     dot: "bg-green-500" },
    sin_creditos: { label: "Sin créditos",  color: "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30",             dot: "bg-red-500",  href: "https://console.anthropic.com/settings/billing" },
    error:        { label: "Error en IA",   color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30", dot: "bg-orange-500" },
    timeout:      { label: "IA lenta",      color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30", dot: "bg-yellow-500" },
    sin_datos:    { label: "IA sin datos",  color: "bg-muted text-muted-foreground border border-border",                               dot: "bg-muted-foreground" },
  };
  const { label, color, dot, href } = cfg[estado];
  const pill = (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${estado === "operativa" ? "animate-pulse" : ""}`} />
      {label}
      {hace && <span className="font-normal opacity-70">· {hace}</span>}
    </span>
  );
  const showMsg = mensaje && (estado === "error" || estado === "timeout");
  const inner = showMsg ? (
    <div className="flex flex-col items-end gap-0.5">
      {pill}
      <span
        className="text-[10px] text-orange-700 dark:text-orange-400 max-w-[260px] truncate"
        title={mensaje}
      >
        {mensaje.slice(0, 90)}
      </span>
    </div>
  ) : pill;
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
