import { NextResponse } from "next/server";
import { procesarLoteCampana } from "@/services/ghl-pipeline-campana";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  actualizarAcumulador, actualizarPaginaCampana,
  contarResolucionesRecientes, obtenerUltimoEncoladoAt,
} from "@/services/ghl-aprobacion";
import {
  calcularFactorFreno, calcularFactorMomento, calcularFactorTurbo, CRON_INTERVAL_MIN,
} from "@/lib/ghl/trust-score";
import { logSistema } from "@/services/log-sistema";

export const runtime    = "nodejs";
export const maxDuration = 300;

const CAMPANA     = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const CAP_DIA     = 10_000;
const HORA_INICIO = 9 * 60 + 30;   // 09:30 CDMX
const HORA_FIN    = 19 * 60 + 30;  // 19:30 CDMX

function horaCDMX(): number {
  const now = new Date();
  const h   = ((now.getUTCHours() - 6) + 24) % 24;
  return h * 60 + now.getUTCMinutes();
}

export async function GET() {
  const stats = await obtenerStatsAprobacion(CAMPANA);

  if (!stats?.activa) {
    return NextResponse.json({ ok: true, motivo: "campana_inactiva" });
  }

  const hora = horaCDMX();
  if (hora < HORA_INICIO || hora >= HORA_FIN) {
    return NextResponse.json({ ok: true, motivo: "fuera_de_horario", hora });
  }

  const enviadosHoy = await contarEnviadosHoy(CAMPANA);
  if (enviadosHoy >= CAP_DIA) {
    void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "warn", resultado: `cap diario alcanzado: ${enviadosHoy}` });
    return NextResponse.json({ ok: true, motivo: "cap_diario", enviadosHoy });
  }

  // ── Velocidad efectiva con freno proporcional por pendientes ──────────────
  const nivel          = calcularNivel(stats);
  const pendientes     = await contarPendientes(CAMPANA);
  const factorFreno    = calcularFactorFreno(pendientes);

  if (factorFreno === 0) {
    void logSistema({
      categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "warn",
      resultado: `freno máximo — ${pendientes} pendientes`,
    });
    return NextResponse.json({ ok: true, motivo: "freno_maximo", pendientes });
  }

  const velocidadEfectiva = nivel.velocidadLeadsPorMin * factorFreno;

  // ── MPS-24 S87: Impulso por ritmo de aprobación reciente ─────────────────
  const resolucionesRecientes = await contarResolucionesRecientes(CAMPANA).catch(() => 0);
  const factorMomento         = calcularFactorMomento(resolucionesRecientes);

  // ── MPS-24 S87-T: Turbo — cola vacía + admin a ritmo máximo ───────────────
  let factorTurbo        = 0;
  let minutosSinEncolar  = 0;
  if (pendientes === 0) {
    const ultimoEncoladoAt = await obtenerUltimoEncoladoAt(CAMPANA).catch(() => null);
    if (ultimoEncoladoAt) {
      minutosSinEncolar = (Date.now() - ultimoEncoladoAt.getTime()) / 60_000;
      factorTurbo = calcularFactorTurbo(minutosSinEncolar, pendientes, resolucionesRecientes);
    }
  }

  const velocidadFinal = velocidadEfectiva * (1 + factorMomento + factorTurbo);

  // ── Token accumulator (soporta tasas fraccionarias como 0.5 leads/min) ───
  const accAnterior  = stats.leads_acumulados ?? 0;
  const accNuevo     = accAnterior + velocidadFinal * CRON_INTERVAL_MIN;
  const leadsToSend  = Math.floor(accNuevo);
  const accResiduo   = accNuevo - leadsToSend;

  if (leadsToSend === 0) {
    await actualizarAcumulador(CAMPANA, accResiduo);
    return NextResponse.json({
      ok: true, motivo: "acumulando",
      acc: accNuevo.toFixed(3), pendientes, factorFreno,
      resolucionesRecientes, factorMomento: factorMomento.toFixed(2),
      factorTurbo: factorTurbo.toFixed(2), minutosSinEncolar: Math.round(minutosSinEncolar),
    });
  }

  // ── Ajustar para no superar el cap diario ────────────────────────────────
  const loteEfectivo = Math.min(leadsToSend, CAP_DIA - enviadosHoy);
  const paginaActual = stats.pagina_campana ?? 1;

  void logSistema({
    categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "inicio",
    resultado: `nivel:${nivel.nivel} vel:${velocidadEfectiva.toFixed(2)}/min momentum:+${Math.round(factorMomento * 100)}% turbo:+${Math.round(factorTurbo * 100)}% (${Math.round(minutosSinEncolar)}min) freno:${Math.round(factorFreno * 100)}% lote:${loteEfectivo}`,
  });

  const resultado = await procesarLoteCampana(paginaActual, loteEfectivo).catch((e) => {
    void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "error", resultado: String(e) });
    return null;
  });

  if (resultado) {
    await Promise.all([
      actualizarAcumulador(CAMPANA, accResiduo, true),
      actualizarPaginaCampana(CAMPANA, resultado.nextPage),
    ]);
    void logSistema({
      categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "ok",
      resultado: `enviados:${resultado.enviados} excluidos:${resultado.excluidos} acc:${accAnterior.toFixed(2)}→${accResiduo.toFixed(2)} pagina:${paginaActual}→${resultado.nextPage ?? 1}`,
      metadata: {
        nivel: nivel.nivel,
        velocidadBase: nivel.velocidadLeadsPorMin,
        velocidadEfectiva,
        velocidadFinal,
        factorFreno,
        factorMomento,
        factorTurbo,
        minutosSinEncolar: Math.round(minutosSinEncolar),
        resolucionesRecientes,
        pendientes,
        loteEfectivo,
        paginaActual,
        nextPage: resultado.nextPage,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    nivel: nivel.nivel,
    velocidadBase: nivel.velocidadLeadsPorMin,
    velocidadEfectiva,
    velocidadFinal,
    factorFreno,
    factorMomento,
    factorTurbo,
    minutosSinEncolar: Math.round(minutosSinEncolar),
    resolucionesRecientes,
    pendientes,
    loteEfectivo,
    paginaActual,
    resultado,
  });
}
