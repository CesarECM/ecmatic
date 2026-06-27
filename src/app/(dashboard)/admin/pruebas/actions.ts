"use server";

import { revalidatePath } from "next/cache";
import {
  listarUsuariosPrueba,
  agregarUsuarioPrueba,
  eliminarUsuarioPrueba,
  obtenerUsuarioPruebaPorId,
  resetLeadECMatic,
  actualizarGhlContactId,
} from "@/services/usuarios-prueba";
import { resetearContactoGHL } from "@/lib/ghl/reset-contacto";
import { buscarOCrearContactoGHL, agregarTagsContacto } from "@/lib/ghl/contacts-api";
import { inscribirEnWorkflow } from "@/lib/ghl/conversations-api";
import { elegirVarianteWorkflow } from "@/services/ab-workflows-ghl";
import { logSistema } from "@/services/log-sistema";
import { createServiceClient } from "@/lib/supabase/service";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const TAG_FUENTE = process.env.GHL_TAG_FUENTE ?? "ecm_b_caliente";

// Convierte número mexicano a E.164 para llamadas a GHL
function aE164(tel: string): string {
  const d = tel.replace(/\D/g, "");
  if (d.length === 10) return `+52${d}`;
  if (d.length === 12 && d.startsWith("52")) return `+${d}`;
  return tel.startsWith("+") ? tel : `+${tel}`;
}

// ── Agregar ──────────────────────────────────────────────────────────────────

export async function agregarUsuarioPruebaAction(formData: FormData) {
  const telefono = (formData.get("telefono") as string)?.trim();
  const nombre = (formData.get("nombre") as string)?.trim();
  const perfilId = (formData.get("perfil_id") as string) || null;

  if (!telefono || !nombre) return { ok: false, error: "Teléfono y nombre son requeridos" };

  const resultado = await agregarUsuarioPrueba(telefono, nombre, perfilId);
  if (resultado.ok) revalidatePath("/admin/pruebas");
  return resultado;
}

// ── Eliminar de la lista (no resetea datos) ──────────────────────────────────

export async function eliminarUsuarioPruebaAction(id: string) {
  await eliminarUsuarioPrueba(id);
  revalidatePath("/admin/pruebas");
}

// ── Reset individual ─────────────────────────────────────────────────────────

export async function resetearUnoAction(
  id: string
): Promise<{ ok: boolean; error?: string; detalles?: string }> {
  const usuario = await obtenerUsuarioPruebaPorId(id);
  if (!usuario) return { ok: false, error: "Usuario no encontrado" };

  let ghlContactId = usuario.ghl_contact_id;

  // Resolver ghl_contact_id si no está cacheado
  if (!ghlContactId) {
    ghlContactId = await buscarOCrearContactoGHL(aE164(usuario.telefono), usuario.nombre).catch(() => null);
    if (ghlContactId) await actualizarGhlContactId(id, ghlContactId);
  }

  // Reset ECMatic
  const { borrado } = await resetLeadECMatic(usuario.telefono, ghlContactId);

  // Reset GHL
  let resultGHL: Awaited<ReturnType<typeof resetearContactoGHL>> | null = null;
  if (ghlContactId) {
    resultGHL = await resetearContactoGHL(ghlContactId).catch((e) => {
      return { tags_eliminados: 0, oportunidades_eliminadas: 0, conversacion_eliminada: false, errores: [String(e)] };
    });
  }

  const esAdmin = !!usuario.perfil_id;
  void logSistema({
    categoria: "servicio",
    tipoAccion: "reset_usuario_prueba",
    fase: resultGHL?.errores?.length ? "warn" : "ok",
    metadata: {
      usuario_prueba_id: id,
      telefono: usuario.telefono,
      es_admin: esAdmin,
      ecmatic_borrado: borrado,
      ghl_tags: resultGHL?.tags_eliminados ?? 0,
      ghl_oportunidades: resultGHL?.oportunidades_eliminadas ?? 0,
      ghl_conversacion: resultGHL?.conversacion_eliminada ?? false,
      ghl_errores: resultGHL?.errores ?? [],
    },
  });

  revalidatePath("/admin/pruebas");
  return {
    ok: true,
    detalles: `ECMatic: ${borrado ? "lead borrado" : "sin lead"}. GHL: ${resultGHL?.tags_eliminados ?? 0} tags, ${resultGHL?.oportunidades_eliminadas ?? 0} oportunidades, conversación: ${resultGHL?.conversacion_eliminada ? "sí" : "no"}.`,
  };
}

// ── Reset todos ───────────────────────────────────────────────────────────────

export async function resetearTodosAction(): Promise<{ ok: boolean; procesados: number; errores: number }> {
  const usuarios = await listarUsuariosPrueba();
  let procesados = 0;
  let errores = 0;

  for (const u of usuarios) {
    const res = await resetearUnoAction(u.id);
    if (res.ok) procesados++; else errores++;
  }

  revalidatePath("/admin/pruebas");
  return { ok: true, procesados, errores };
}

// ── Agregar a campaña ─────────────────────────────────────────────────────────

export async function agregarACampanaAction(
  id: string
): Promise<{ ok: boolean; error?: string; variante?: string }> {
  const workflowA = process.env.GHL_WORKFLOW_A_ID ?? "";
  const workflowB = process.env.GHL_WORKFLOW_B_ID ?? "";
  if (!workflowA || !workflowB) {
    return { ok: false, error: "GHL_WORKFLOW_A_ID y GHL_WORKFLOW_B_ID no configurados" };
  }

  const usuario = await obtenerUsuarioPruebaPorId(id);
  if (!usuario) return { ok: false, error: "Usuario no encontrado en usuarios_prueba" };

  void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "inicio",
    resultado: `telefono:${usuario.telefono} ghl_id_cacheado:${usuario.ghl_contact_id ?? "null"}`,
    metadata: { usuario_prueba_id: id } });

  // Usar el ID cacheado si existe; si no, buscarlo/crearlo en GHL normalizando a E.164
  let ghlContactId = usuario.ghl_contact_id;
  if (!ghlContactId) {
    const telefonoE164 = aE164(usuario.telefono);
    void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "llamado",
      resultado: `buscando contacto GHL telefono_e164:${telefonoE164}` });
    ghlContactId = await buscarOCrearContactoGHL(telefonoE164, usuario.nombre).catch(() => null);
    if (!ghlContactId) return { ok: false, error: "No se pudo obtener contacto GHL — verifica GHL_API_KEY y formato del teléfono" };
    await actualizarGhlContactId(id, ghlContactId);
  }

  void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "llamado",
    resultado: `ghlContactId:${ghlContactId}` });

  // Crear el lead en ECMatic antes de lanzar el trigger (el webhook SBC lo necesita)
  const db = createServiceClient();
  const { error: leadErr } = await db.from("leads").upsert(
    {
      telefono:            `ghl_${ghlContactId}`,
      canal_origen:        "whatsapp",
      privacidad_aceptada: true,
      nombre:              usuario.nombre,
    },
    { onConflict: "telefono" }
  );
  void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: leadErr ? "error" : "llamado",
    resultado: `lead_upsert:${leadErr ? leadErr.message : "ok"} telefono:ghl_${ghlContactId}` });

  // Tag fuente + elegir variante + inscribir en workflow GHL
  await agregarTagsContacto(ghlContactId, [TAG_FUENTE]).catch((e) =>
    void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "warn", resultado: `tag_err:${String(e).slice(0,100)}` })
  );
  const variante = await elegirVarianteWorkflow(CAMPANA_ACTIVA);
  const workflowId = variante === "a" ? workflowA : workflowB;

  void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "llamado",
    resultado: `inscribiendo variante:${variante} workflowId:${workflowId} eventStartTime:${new Date(Date.now() + 360_000).toISOString()}` });

  try {
    await inscribirEnWorkflow(ghlContactId, workflowId);
  } catch (err) {
    const msg = String(err);
    void logSistema({ categoria: "servicio", tipoAccion: "campana_usuario_prueba", fase: "error",
      resultado: `workflow_err:${msg.slice(0, 500)}`, metadata: { ghlContactId, workflowId } });
    return { ok: false, error: `Error workflow GHL: ${msg.slice(0, 300)}` };
  }

  // Registrar en ghl_campana_logs (delete + insert para evitar duplicados sin necesitar constraint única)
  await (db as any).from("ghl_campana_logs")
    .delete()
    .eq("ghl_contact_id", ghlContactId)
    .eq("campana", CAMPANA_ACTIVA);

  await (db as any).from("ghl_campana_logs").insert({
    ghl_contact_id: ghlContactId,
    nombre:         usuario.nombre,
    campana:        CAMPANA_ACTIVA,
    variante,
    enviado:        true,
    enviado_at:     new Date().toISOString(),
    categoria_sbc:  "prueba_manual",
  });

  void logSistema({
    categoria:  "servicio",
    tipoAccion: "campana_usuario_prueba",
    fase:       "ok",
    resultado:  `variante:${variante} workflowId:${workflowId}`,
    metadata:   { usuario_prueba_id: id, ghl_contact_id: ghlContactId, campana: CAMPANA_ACTIVA },
  });

  revalidatePath("/admin/pruebas");
  return { ok: true, variante };
}
