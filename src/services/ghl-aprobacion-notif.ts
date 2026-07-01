import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { obtenerOCrearConversacionWA, enviarMensajeGHL } from "@/lib/ghl/conversations-api";
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
  requiereTemplate?: boolean; // MPS-19: lead fuera de ventana WA 24h
}

function prefijo(urgencia: number): string {
  if (urgencia === 0) return "🔔";
  if (urgencia === 1) return "⚠️ URGENTE";
  if (urgencia === 2) return "🚨 URGENTE";
  return "🆘 URGENTE";
}

export async function notificarBatchPendientesGHL(total: number): Promise<void> {
  const adminWa = process.env.ADMIN_WHATSAPP;
  if (!adminWa) return;

  const texto =
    `📬 *Cola de aprobación: ${total} mensajes pendientes*\n\n` +
    `Revisar → ${BASE_URL}/admin/aprobaciones`;

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "ghl_aprobacion.notif_batch",
    fase:       "inicio",
    resultado:  `total:${total} adminWa:${adminWa}`,
  });

  try {
    const adminContactId = await buscarOCrearContactoGHL(adminWa, "César Admin");
    if (!adminContactId) throw new Error("buscarOCrearContactoGHL retornó null");

    const adminConvId = await obtenerOCrearConversacionWA(adminContactId);
    if (!adminConvId) throw new Error("obtenerOCrearConversacionWA retornó null");

    await enviarMensajeGHL(adminConvId, texto, adminContactId);

    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif_batch",
      fase:       "ok",
      resultado:  `batch_enviado total:${total}`,
    });
  } catch (err) {
    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif_batch",
      fase:       "error",
      resultado:  String(err).slice(0, 200),
    });
  }
}

export async function notificarMensajePendienteGHL(params: ParamsNotifGHL): Promise<void> {
  const { contactId, nombre, mensajeLead, scoreIA, leadEcmaticId, urgencia = 0, requiereTemplate = false } = params;
  const adminWa = process.env.ADMIN_WHATSAPP;

  if (!adminWa) {
    void logSistema({
      categoria: "webhook",
      tipoAccion: "ghl_aprobacion.notif",
      fase: "warn",
      resultado: "ADMIN_WHATSAPP no configurado",
    });
    return;
  }

  const displayNombre = nombre ?? contactId.slice(-6);
  const fichaUrl      = leadEcmaticId
    ? `${BASE_URL}/admin/leads/${leadEcmaticId}`
    : `${BASE_URL}/admin/aprobaciones`;

  // MPS-19: notificación diferenciada cuando se requiere template
  const texto = requiereTemplate
    ? `${prefijo(urgencia)} *Seguimiento requiere template WA*\n\n` +
      `👤 ${displayNombre}\n` +
      `⚠️ La ventana de 24h está cerrada — NO se puede enviar mensaje libre.\n` +
      `📋 El sistema generó un texto de referencia para que lo adaptes al template en GHL.\n\n` +
      `1️⃣ Abre la ficha del lead → ${fichaUrl}\n` +
      `2️⃣ Copia el texto sugerido\n` +
      `3️⃣ Ve a GHL → envía el template al contacto\n` +
      `4️⃣ Regresa a ECMatic y marca "Enviado manualmente"`
    : `${prefijo(urgencia)} *Mensaje GHL pendiente de aprobación*\n\n` +
      `👤 ${displayNombre}\n` +
      `💬 "${mensajeLead.slice(0, 100)}${mensajeLead.length > 100 ? "…" : ""}"\n` +
      `🎯 Score IA: ${Math.round(scoreIA * 100)}%\n\n` +
      `Revisar → ${fichaUrl}`;

  void logSistema({
    categoria:  "webhook",
    tipoAccion: "ghl_aprobacion.notif",
    fase:       "inicio",
    resultado:  `adminWa:${adminWa} urgencia:${urgencia}`,
    metadata:   { contactId, scoreIA },
  });

  try {
    const adminContactId = await buscarOCrearContactoGHL(adminWa, "César Admin");
    if (!adminContactId) throw new Error("buscarOCrearContactoGHL retornó null");

    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif",
      fase:       "llamado",
      resultado:  `contacto_ok adminContactId:${adminContactId}`,
      metadata:   { contactId, scoreIA },
    });

    const adminConvId = await obtenerOCrearConversacionWA(adminContactId);
    if (!adminConvId) throw new Error("obtenerOCrearConversacionWA retornó null");

    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif",
      fase:       "llamado",
      resultado:  `conv_ok adminConvId:${adminConvId}`,
      metadata:   { contactId, scoreIA },
    });

    await enviarMensajeGHL(adminConvId, texto, adminContactId);

    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif",
      fase:       "ok",
      resultado:  `mensaje_enviado adminWa:${adminWa}`,
      metadata:   { contactId, scoreIA },
    });
  } catch (err) {
    void logSistema({
      categoria:  "webhook",
      tipoAccion: "ghl_aprobacion.notif",
      fase:       "error",
      resultado:  `${String(err).slice(0, 200)} | adminWa:${adminWa}`,
      metadata:   { contactId, scoreIA },
    });
  }
}
