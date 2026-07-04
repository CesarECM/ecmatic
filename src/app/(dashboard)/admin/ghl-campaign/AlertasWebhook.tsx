"use client";

export interface AlertasWebhookData {
  erroresBuffer24h:   number;
  erroresMotorIA24h:  number;
  fueraCampana24h:    number;
  cuerpoVacio24h:     number;
  minutosDesdeWebhook: number | null; // null = no hay registro alguno
  enHorarioOperativo: boolean;
}

const SILENCIO_UMBRAL_MIN = 120; // 2 h sin webhooks durante horario operativo

function tiempoTexto(minutos: number): string {
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m > 0 ? `hace ${h} h ${m} min` : `hace ${h} h`;
}

export function AlertasWebhook({ datos }: { datos: AlertasWebhookData }) {
  const {
    erroresBuffer24h, erroresMotorIA24h,
    fueraCampana24h, cuerpoVacio24h,
    minutosDesdeWebhook, enHorarioOperativo,
  } = datos;

  const hayErroresCriticos  = erroresBuffer24h > 0 || erroresMotorIA24h > 0;
  const hayFueraCampana     = fueraCampana24h > 0;
  const hayCuerpoVacio      = cuerpoVacio24h > 0;
  const haySilencioWebhook  =
    enHorarioOperativo &&
    minutosDesdeWebhook !== null &&
    minutosDesdeWebhook >= SILENCIO_UMBRAL_MIN;

  // Silencio total: nunca hubo webhooks (minutosDesdeWebhook === null)
  const haySilencioTotal = minutosDesdeWebhook === null;

  if (!hayErroresCriticos && !hayFueraCampana && !hayCuerpoVacio && !haySilencioWebhook && !haySilencioTotal) {
    return null;
  }

  return (
    <div className="space-y-2">

      {/* ── Errores críticos de procesamiento ────────────────────── */}
      {hayErroresCriticos && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/8 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            Errores de procesamiento — mensajes no respondidos
          </p>
          {erroresBuffer24h > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              · <strong>{erroresBuffer24h}</strong> error{erroresBuffer24h !== 1 ? "es" : ""} al procesar el buffer de mensajes en las últimas 24 h
              {" — "}posibles webhooks descartados
            </p>
          )}
          {erroresMotorIA24h > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              · <strong>{erroresMotorIA24h}</strong> error{erroresMotorIA24h !== 1 ? "es" : ""} en el motor IA en las últimas 24 h
              {" — "}respuestas no generadas
            </p>
          )}
          <a
            href="/admin/log?categoria=webhook"
            className="inline-block text-xs text-red-600 dark:text-red-400 underline hover:opacity-80"
          >
            Ver logs →
          </a>
        </div>
      )}

      {/* ── Silencio de webhooks GHL ─────────────────────────────── */}
      {(haySilencioWebhook || haySilencioTotal) && (
        <div className="rounded-lg border border-blue-500/50 bg-blue-500/8 p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            GHL no está entregando webhooks
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {haySilencioTotal
              ? "· ECMatic nunca recibió un webhook de GHL — verifica la configuración del webhook en GHL"
              : `· Último mensaje recibido ${tiempoTexto(minutosDesdeWebhook!)} — si hay conversaciones activas en GHL, los mensajes se están perdiendo`}
          </p>
          <p className="text-xs text-muted-foreground">
            Si un lead respondió pero no aparece en cola de aprobaciones, probablemente GHL no entregó el webhook.
            Puedes inyectar el mensaje manualmente desde la ficha del lead.
          </p>
          <a
            href="/admin/log?categoria=webhook&tipo=webhook.ghl.raw"
            className="inline-block text-xs text-blue-600 dark:text-blue-400 underline hover:opacity-80"
          >
            Ver historial de webhooks →
          </a>
        </div>
      )}

      {/* ── Mensajes fuera de campaña (cola forzada) ─────────────── */}
      {(hayFueraCampana || hayCuerpoVacio) && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/8 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Mensajes fuera del flujo normal
          </p>
          {hayFueraCampana && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              · <strong>{fueraCampana24h}</strong> mensaje{fueraCampana24h !== 1 ? "s" : ""} de leads sin registro de campaña
              {" — "}enviados a la cola de aprobación para revisión manual
            </p>
          )}
          {hayCuerpoVacio && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              · <strong>{cuerpoVacio24h}</strong> webhook{cuerpoVacio24h !== 1 ? "s" : ""} sin cuerpo de mensaje
              {" — "}posiblemente imágenes, audios o mensajes de estado (ignorados correctamente)
            </p>
          )}
          <a
            href="/admin/aprobaciones"
            className="inline-block text-xs text-amber-700 dark:text-amber-400 underline hover:opacity-80"
          >
            Revisar cola de aprobaciones →
          </a>
        </div>
      )}

    </div>
  );
}
