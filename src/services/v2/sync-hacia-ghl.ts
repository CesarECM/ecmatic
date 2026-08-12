// S149.2 — ECMatic v2 → GHL: push de datos capturados en v2 hacia el contacto GHL.
// Directriz D1: mensajería WA saliente siempre por GHL.
// Este módulo es la dirección opuesta: datos capturados por ECMatic que GHL necesita.

import { actualizarDatosContactoGHL, actualizarCustomFieldGHL } from "@/lib/ghl/contacts-api";
import { logSistema } from "@/services/log-sistema";

const GHL_CF_FECHA_REACTIVACION = process.env.GHL_CF_FECHA_REACTIVACION;
const GHL_CF_SCORE_URGENCIA     = process.env.GHL_CF_SCORE_URGENCIA;

// Escribe fecha_reactivacion en el custom field GHL del contacto.
// Solo actúa si GHL_CF_FECHA_REACTIVACION está configurado.
export async function sincronizarFechaReactivacionGHL(
  ghlContactId: string,
  fechaISO:     string,  // ISO8601 UTC
): Promise<void> {
  if (!GHL_CF_FECHA_REACTIVACION) {
    void logSistema({
      categoria:  "servicio",
      tipoAccion: "v2.sync_ghl.fecha_reactivacion",
      fase:       "warn",
      resultado:  "GHL_CF_FECHA_REACTIVACION no configurado — sync omitido",
      metadata:   { ghlContactId },
    });
    return;
  }

  const ok = await actualizarCustomFieldGHL(
    ghlContactId,
    GHL_CF_FECHA_REACTIVACION,
    fechaISO,
  );

  void logSistema({
    categoria:  "servicio",
    tipoAccion: "v2.sync_ghl.fecha_reactivacion",
    fase:       ok ? "ok" : "error",
    resultado:  ok ? `Campo actualizado: ${fechaISO}` : "actualizarCustomFieldGHL devolvió false",
    metadata:   { ghlContactId, fechaISO, fieldId: GHL_CF_FECHA_REACTIVACION },
  });
}

// Escribe score_urgencia en el custom field GHL del contacto (S151.2).
// El valor se envía como texto "0"–"100" para compatibilidad con campos de texto en GHL.
export async function sincronizarScoreUrgenciaGHL(
  ghlContactId: string,
  score:         number,
): Promise<void> {
  if (!GHL_CF_SCORE_URGENCIA) return;

  const ok = await actualizarCustomFieldGHL(
    ghlContactId,
    GHL_CF_SCORE_URGENCIA,
    String(score),
  );

  void logSistema({
    categoria:  "servicio",
    tipoAccion: "v2.sync_ghl.score_urgencia",
    fase:       ok ? "ok" : "error",
    resultado:  ok ? `Score urgencia: ${score}` : "actualizarCustomFieldGHL devolvió false",
    metadata:   { ghlContactId, score, fieldId: GHL_CF_SCORE_URGENCIA },
  });
}

// Empuja nombre y/o email capturados por v2 al contacto GHL.
// Solo envía campos con valor; nunca sobreescribe con null.
export async function sincronizarDatosContactoGHL(
  ghlContactId: string,
  campos: { nombre?: string | null; email?: string | null },
): Promise<void> {
  const ghlCampos: { firstName?: string; lastName?: string; email?: string } = {};

  if (campos.nombre) {
    const partes = campos.nombre.trim().split(/\s+/);
    ghlCampos.firstName = partes[0];
    if (partes.length > 1) ghlCampos.lastName = partes.slice(1).join(" ");
  }

  if (campos.email) ghlCampos.email = campos.email;
  if (!Object.keys(ghlCampos).length) return;

  const ok = await actualizarDatosContactoGHL(ghlContactId, ghlCampos);

  void logSistema({
    categoria:  "servicio",
    tipoAccion: "v2.sync_ghl.datos_contacto",
    fase:       ok ? "ok" : "error",
    resultado:  ok
      ? `Campos sincronizados: ${Object.keys(ghlCampos).join(", ")}`
      : "actualizarDatosContactoGHL devolvió false",
    metadata:   { ghlContactId, campos: Object.keys(ghlCampos) },
  });
}
