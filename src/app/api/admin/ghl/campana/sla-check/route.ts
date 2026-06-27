import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { listarPendientesGHL, registrarNotificacionSLA } from "@/services/ghl-aprobacion";
import { notificarMensajePendienteGHL } from "@/services/ghl-aprobacion-notif";

const CRON_SECRET = process.env.CRON_SECRET;

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

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void logSistema({ categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "inicio", resultado: "Revisando SLA cola aprobación GHL" });

  const inicio = Date.now();
  let notificados = 0;

  try {
    const pendientes = await listarPendientesGHL();

    for (const item of pendientes) {
      const minutos = minutosDesde(item.created_at);
      const conteo  = item.conteo_notificaciones;

      if (!notificacionEsperada(minutos, conteo)) continue;

      await notificarMensajePendienteGHL({
        itemId:        item.id,
        convId:        item.conv_id,
        contactId:     item.ghl_contact_id,
        nombre:        item.nombre,
        mensajeLead:   item.mensaje_lead,
        scoreIA:       item.score_ia ?? 0.5,
        leadEcmaticId: item.lead_ecmatic_id ?? undefined,
        urgencia:      conteo,
      }).catch(() => null);

      await registrarNotificacionSLA(item.id, conteo);
      notificados++;
    }

    void logSistema({
      categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "ok",
      resultado: `${pendientes.length} pendientes, ${notificados} notificados`,
      metadata:  { pendientes: pendientes.length, notificados, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ pendientes: pendientes.length, notificados });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    void logSistema({ categoria: "cron", tipoAccion: "cron.ghl-sla-check", fase: "error", resultado: msg, metadata: { duracion_ms: Date.now() - inicio } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
