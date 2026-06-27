import { sendTextMessage } from "@/lib/whatsapp/client";
import { crearNotaInternaGHL } from "@/lib/ghl/conversations-api";
import { logSistema } from "@/services/log-sistema";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";

export interface ParamsNotifGHL {
  itemId: string;
  convId: string;
  contactId: string;
  nombre: string | null;
  mensajeLead: string;
  scoreIA: number;
  leadEcmaticId?: string;
  urgencia?: number;
}

// Construye el prefijo según el nivel de urgencia (conteo de notificaciones)
function prefijo(urgencia: number): string {
  if (urgencia === 0) return "🔔";
  if (urgencia === 1) return "⚠️ URGENTE";
  if (urgencia === 2) return "🚨 URGENTE";
  return "🆘 URGENTE";
}

export async function notificarMensajePendienteGHL(params: ParamsNotifGHL): Promise<void> {
  const { itemId, convId, contactId, nombre, mensajeLead, scoreIA, leadEcmaticId, urgencia = 0 } = params;
  const adminWa = process.env.ADMIN_WHATSAPP;

  const displayNombre = nombre ?? contactId.slice(-6);
  const scoreDisplay  = `${Math.round(scoreIA * 100)}%`;
  const fichaUrl      = leadEcmaticId
    ? `${BASE_URL}/admin/leads/${leadEcmaticId}`
    : `${BASE_URL}/admin/aprobaciones`;

  const emoji = prefijo(urgencia);

  // Mensaje WA al admin
  const mensajeWA =
    `${emoji} *Mensaje GHL pendiente de aprobación*\n\n` +
    `👤 ${displayNombre}\n` +
    `💬 "${mensajeLead.slice(0, 100)}${mensajeLead.length > 100 ? "…" : ""}"\n` +
    `🎯 Score IA: ${scoreDisplay}\n\n` +
    `Revisar → ${fichaUrl}`;

  // Nota interna en GHL (trigger LeadConnector push)
  const notaGHL =
    `${emoji} ECMatic — Respuesta pendiente de aprobación\n` +
    `Score: ${scoreDisplay} | Item: ${itemId}\n` +
    `Revisar en ECMatic → ${fichaUrl}`;

  const resultados = await Promise.allSettled([
    adminWa
      ? sendTextMessage(adminWa, mensajeWA)
      : Promise.reject(new Error("ADMIN_WHATSAPP no configurado")),
    crearNotaInternaGHL(contactId, notaGHL),
  ]);

  const waOk   = resultados[0].status === "fulfilled";
  const ghlOk  = resultados[1].status === "fulfilled";
  const waErr  = !waOk  ? (resultados[0] as PromiseRejectedResult).reason : null;
  const ghlErr = !ghlOk ? (resultados[1] as PromiseRejectedResult).reason : null;

  const waErrStr  = waErr  ? ` | wa_err: ${String(waErr).slice(0, 150)}`  : "";
  const ghlErrStr = ghlErr ? ` | ghl_err: ${String(ghlErr).slice(0, 150)}` : "";

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "ghl_aprobacion.notif",
    fase:       waOk || ghlOk ? "ok" : "error",
    resultado:  `wa:${waOk} ghl:${ghlOk} adminWa:${adminWa ?? "null"} convId:${convId}${waErrStr}${ghlErrStr}`,
    metadata:   { itemId, contactId, scoreIA },
  });
}
