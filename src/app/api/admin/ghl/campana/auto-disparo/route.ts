import { NextResponse } from "next/server";
import { procesarLoteCampana } from "@/services/ghl-pipeline-campana";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  actualizarAcumulador, actualizarPaginaCampana,
} from "@/services/ghl-aprobacion";
import { calcularFactorFreno, CRON_INTERVAL_MIN } from "@/lib/ghl/trust-score";
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

  // ── Token accumulator (soporta tasas fraccionarias como 0.5 leads/min) ───
  const accAnterior  = stats.leads_acumulados ?? 0;
  const accNuevo     = accAnterior + velocidadEfectiva * CRON_INTERVAL_MIN;
  const leadsToSend  = Math.floor(accNuevo);
  const accResiduo   = accNuevo - leadsToSend;

  if (leadsToSend === 0) {
    await actualizarAcumulador(CAMPANA, accResiduo);
    return NextResponse.json({
      ok: true, motivo: "acumulando",
      acc: accNuevo.toFixed(3), pendientes, factorFreno,
    });
  }

  // ── Ajustar para no superar el cap diario ────────────────────────────────
  const loteEfectivo = Math.min(leadsToSend, CAP_DIA - enviadosHoy);
  const paginaActual = stats.pagina_campana ?? 1;

  void logSistema({
    categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "inicio",
    resultado: `nivel:${nivel.nivel} vel:${velocidadEfectiva.toFixed(2)}/min freno:${Math.round(factorFreno * 100)}% lote:${loteEfectivo} pendientes:${pendientes}`,
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
        factorFreno,
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
    factorFreno,
    pendientes,
    loteEfectivo,
    paginaActual,
    resultado,
  });
}
