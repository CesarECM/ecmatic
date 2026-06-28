import { NextResponse } from "next/server";
import { procesarLoteCampana } from "@/services/ghl-pipeline-campana";
import {
  obtenerStatsAprobacion, calcularNivel,
  contarEnviadosHoy, contarPendientes,
  registrarLoteAuto, actualizarPaginaCampana,
  debeNotificarPausa, registrarNotifPausa,
} from "@/services/ghl-aprobacion";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { logSistema } from "@/services/log-sistema";

export const runtime = "nodejs";
export const maxDuration = 300;

const CAMPANA       = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const CAP_DIA       = 1_000;
const HORA_INICIO   = 9 * 60 + 30;  // 09:30 CDMX
const HORA_FIN      = 19 * 60 + 30; // 19:30 CDMX
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";

function horaCDMX(): number {
  const now = new Date();
  const h = ((now.getUTCHours() - 6) + 24) % 24;
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

  const pendientes = await contarPendientes(CAMPANA);
  if (pendientes > 0) {
    const adminWa = process.env.ADMIN_WHATSAPP;
    if (adminWa && (await debeNotificarPausa(CAMPANA))) {
      void sendTextMessage(
        adminWa,
        `⏸ *Campaña SBC pausada*\n\n${pendientes} mensaje${pendientes > 1 ? "s" : ""} pendiente${pendientes > 1 ? "s" : ""} de aprobación.\n\nRevisar → ${BASE_URL}/admin/aprobaciones`,
      ).catch(() => null);
      await registrarNotifPausa(CAMPANA);
    }
    void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "warn", resultado: `pausada — ${pendientes} pendientes` });
    return NextResponse.json({ ok: true, motivo: "pausada_por_pendientes", pendientes });
  }

  const enviadosHoy = await contarEnviadosHoy(CAMPANA);
  if (enviadosHoy >= CAP_DIA) {
    void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "warn", resultado: `cap diario alcanzado: ${enviadosHoy}` });
    return NextResponse.json({ ok: true, motivo: "cap_diario", enviadosHoy });
  }

  const nivel = calcularNivel(stats);

  // Verificar si ya pasó el intervalo mínimo desde el último lote
  if (stats.ultimo_lote_at) {
    const msDesdeUltimo = Date.now() - new Date(stats.ultimo_lote_at).getTime();
    const msIntervalo   = nivel.intervaloMin * 60 * 1000;
    if (msDesdeUltimo < msIntervalo) {
      const restaMin = Math.ceil((msIntervalo - msDesdeUltimo) / 60_000);
      return NextResponse.json({ ok: true, motivo: "intervalo_no_cumplido", restaMin, nivel: nivel.nivel });
    }
  }

  // Ajustar lote para no superar el cap diario
  const disponibles  = CAP_DIA - enviadosHoy;
  const tamanoLote   = Math.min(nivel.tamanoLote, disponibles);

  void logSistema({
    categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "inicio",
    resultado: `nivel:${nivel.nivel} lote:${tamanoLote} enviadosHoy:${enviadosHoy}`,
  });

  const paginaActual = stats.pagina_campana ?? 1;

  const resultado = await procesarLoteCampana(paginaActual, tamanoLote).catch((e) => {
    void logSistema({ categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "error", resultado: String(e) });
    return null;
  });

  if (resultado) {
    await Promise.all([
      registrarLoteAuto(CAMPANA),
      actualizarPaginaCampana(CAMPANA, resultado.nextPage),
    ]);
    void logSistema({
      categoria: "cron", tipoAccion: "ghl_campana.auto", fase: "ok",
      resultado: `enviados:${resultado.enviados} excluidos:${resultado.excluidos} pagina:${paginaActual}→${resultado.nextPage ?? 1}`,
      metadata: { nivel: nivel.nivel, tamanoLote, paginaActual, nextPage: resultado.nextPage },
    });
  }

  return NextResponse.json({ ok: true, nivel: nivel.nivel, tamanoLote, paginaActual, resultado });
}
