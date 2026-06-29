// MPS-6 S41.5 — Cron de decay temporal del trust_score.
// Inyecta un phantom edit en la ventana si el admin lleva más de DECAY_GRACE_DAYS
// sin tomar ninguna decisión humana. Máximo 1 phantom por período de 24h.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerStatsAprobacion } from "@/services/ghl-aprobacion";
import { injectPhantomEdit, calcularTrustScore, DECAY_GRACE_DAYS, UMBRAL_AUTO_FIJO, TRUST_NIVEL4 } from "@/lib/ghl/trust-score";
import { logSistema } from "@/services/log-sistema";

export const runtime = "nodejs";

const CAMPANA    = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const MS_DIA     = 24 * 60 * 60 * 1000;
const MS_GRACE   = DECAY_GRACE_DAYS * MS_DIA;

export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stats = await obtenerStatsAprobacion(CAMPANA);
  if (!stats) return NextResponse.json({ ok: true, motivo: "sin_stats" });

  const ahora = Date.now();

  // Referencia temporal: la más reciente entre última decisión y último phantom
  const ultimaActividad = Math.max(
    stats.last_decision_at ? new Date(stats.last_decision_at).getTime() : 0,
    stats.last_phantom_at  ? new Date(stats.last_phantom_at).getTime()  : 0,
  );

  const sinActividad = ultimaActividad === 0;
  const diasInactivo = sinActividad ? 0 : (ahora - ultimaActividad) / MS_DIA;

  // Solo decaer si supera el período de gracia Y han pasado ≥ 24h desde el último phantom
  const dentroDe24h = stats.last_phantom_at
    ? (ahora - new Date(stats.last_phantom_at).getTime()) < MS_DIA
    : false;

  const sinDecision = !stats.last_decision_at ||
    (ahora - new Date(stats.last_decision_at).getTime()) > MS_GRACE;

  if (!sinDecision || dentroDe24h) {
    return NextResponse.json({
      ok: true,
      motivo: dentroDe24h ? "phantom_reciente_24h" : "dentro_de_grace_period",
      diasInactivo: Math.round(diasInactivo * 10) / 10,
    });
  }

  // Inyectar un phantom edit
  const supabase = createServiceClient() as any;
  const windowActual = Array.isArray(stats.decisions_window) ? stats.decisions_window : [];
  const windowSize   = stats.window_size ?? 20;
  const nuevaVentana = injectPhantomEdit(windowActual, windowSize);
  const nuevoScore   = calcularTrustScore(nuevaVentana);

  // Si estaba automatizado y el score cae bajo el umbral, desactivar
  const debeDesautomatizar = stats.automatizado && nuevoScore < TRUST_NIVEL4;

  await supabase
    .from("ghl_approval_stats")
    .update({
      decisions_window: nuevaVentana,
      trust_score:      nuevoScore,
      umbral_auto:      UMBRAL_AUTO_FIJO,
      last_phantom_at:  new Date(ahora).toISOString(),
      ...(debeDesautomatizar && { automatizado: false }),
      updated_at:       new Date(ahora).toISOString(),
    })
    .eq("campana_key", CAMPANA);

  void logSistema({
    categoria:  "cron",
    tipoAccion: "ghl_campana.decay",
    fase:       "ok",
    resultado:  `phantom inyectado — score: ${stats.trust_score.toFixed(3)} → ${nuevoScore.toFixed(3)} | diasInactivo: ${diasInactivo.toFixed(1)}`,
    metadata:   { diasInactivo, nuevoScore, debeDesautomatizar },
  });

  return NextResponse.json({
    ok: true,
    diasInactivo: Math.round(diasInactivo * 10) / 10,
    scoreAntes:   stats.trust_score,
    scoreDespues: nuevoScore,
    debeDesautomatizar,
  });
}
