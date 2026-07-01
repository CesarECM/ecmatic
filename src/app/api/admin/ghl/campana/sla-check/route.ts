import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { listarPendientesGHL, registrarNotificacionSLA } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL, notificarBatchPendientesGHL } from "@/services/ghl-aprobacion-notif";

const CRON_SECRET = process.env.CRON_SECRET;
const UMBRAL_BATCH = 10; // > este número → notificación única de resumen

// Minutos desde creación → índice de notificación esperado
// t+4h=240m → t+6h=360m → t+7h=420m → t+7.5h=450m → t+7.5h+5m cada 5m
const UMBRALES_MINUTOS = [240, 360, 420, 450];

function minutosDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000);
}

function notificacionEsperada(minutos: number, conteo: number): boolean {
  // Primeras 4 notificaciones según umbrales fijos
  if (conteo < UMBRALES_MINUTOS.length) {
    return minutos >= UMBRALES_MINUTOS[conteo];
  }
  // A partir de la 5a notificación: cada 5 minutos después del umbral 450m
  const minutosDesde450 = minutos - UMBRALES_MINUTOS[UMBRALES_MINUTOS.length - 1];
  const intervalo = 5;
  const notifAdicionales = Math.floor(minutosDesde450 / intervalo);
  return notifAdicionales >= (conteo - UMBRALES_MINUTOS.length + 1);
}

// 9am–10pm CDMX (UTC-6 fijo desde 2023): 15:00–04:00 UTC
function enHorarioHabil(): boolean {
  const h = new Date().getUTCHours();
  return h >= 15 || h < 4;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void logSistema({ categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "inicio", resultado: "Revisando SLA cola aprobación GHL" });

  if (!enHorarioHabil()) {
    void logSistema({ categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "debug", resultado: "Fuera de horario (9am–10pm CDMX)" });
    return NextResponse.json({ pendientes: 0, notificados: 0, fuera_horario: true });
  }

  const inicio = Date.now();
  let notificados = 0;

  try {
    const pendientes = await listarPendientesGHL();

    const debenNotificar = pendientes.filter(item =>
      notificacionEsperada(minutosDesde(item.created_at), item.conteo_notificaciones)
    );

    if (debenNotificar.length > 0) {
      if (pendientes.length > UMBRAL_BATCH) {
        await notificarBatchPendientesGHL(pendientes.length).catch(() => null);
        await Promise.all(
          debenNotificar.map(item => registrarNotificacionSLA(item.id, item.conteo_notificaciones))
        );
        notificados = debenNotificar.length;
      } else {
        for (const item of debenNotificar) {
          await notificarMensajePendienteGHL({
            itemId:        item.id,
            convId:        item.conv_id,
            contactId:     item.ghl_contact_id,
            nombre:        item.nombre,
            mensajeLead:   item.mensaje_lead,
            scoreIA:       item.score_ia ?? 0.5,
            leadEcmaticId: item.lead_ecmatic_id ?? undefined,
            urgencia:      item.conteo_notificaciones,
          }).catch(() => null);

          await registrarNotificacionSLA(item.id, item.conteo_notificaciones);
          notificados++;
        }
      }
    }

    void logSistema({
      categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "ok",
      resultado: `${pendientes.length} pendientes, ${notificados} notificados`,
      metadata:  { pendientes: pendientes.length, notificados, batch: pendientes.length > UMBRAL_BATCH, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ pendientes: pendientes.length, notificados });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    void logSistema({ categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "error", resultado: msg, metadata: { duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
