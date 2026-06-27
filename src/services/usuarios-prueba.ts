import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

export interface UsuarioPrueba {
  id: string;
  telefono: string;
  nombre: string;
  perfil_id: string | null;
  ghl_contact_id: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface EstadoUsuarioPrueba extends UsuarioPrueba {
  tiene_lead: boolean;
  en_campana: boolean;
  es_admin_ecmatic: boolean;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listarUsuariosPrueba(): Promise<EstadoUsuarioPrueba[]> {
  const db = createServiceClient();

  const { data: usuarios } = await (db as any)
    .from("usuarios_prueba")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: true }) as { data: UsuarioPrueba[] | null };

  if (!usuarios?.length) return [];

  const telefonos = usuarios.map((u) => u.telefono);

  const [
    { data: leads },
    { data: logsGHL },
    { data: perfilesAdmin },
  ] = await Promise.all([
    db.from("leads").select("telefono").in("telefono", telefonos),
    (db as any).from("ghl_campana_logs").select("ghl_contact_id")
      .in("ghl_contact_id", usuarios.map((u) => u.ghl_contact_id).filter(Boolean)) as Promise<{ data: { ghl_contact_id: string }[] | null }>,
    db.from("profiles").select("whatsapp_personal").eq("rol", "admin").not("whatsapp_personal", "is", null),
  ]);

  const telefonosConLead = new Set((leads ?? []).map((l: { telefono: string | null }) => l.telefono).filter(Boolean) as string[]);
  const ghlIdsEnCampana = new Set((logsGHL ?? []).map((l) => l.ghl_contact_id));
  const telefonosAdmin = new Set((perfilesAdmin ?? []).map((p: { whatsapp_personal: string | null }) => p.whatsapp_personal).filter(Boolean) as string[]);

  return usuarios.map((u) => ({
    ...u,
    tiene_lead:       telefonosConLead.has(u.telefono),
    en_campana:       u.ghl_contact_id ? ghlIdsEnCampana.has(u.ghl_contact_id) : false,
    es_admin_ecmatic: telefonosAdmin.has(u.telefono),
  }));
}

export async function agregarUsuarioPrueba(
  telefono: string,
  nombre: string,
  perfilId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { error } = await (db as any)
    .from("usuarios_prueba")
    .insert({ telefono: telefono.trim(), nombre: nombre.trim(), perfil_id: perfilId ?? null });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarUsuarioPrueba(id: string): Promise<void> {
  const db = createServiceClient();
  await (db as any).from("usuarios_prueba").delete().eq("id", id);
}

export async function obtenerUsuarioPruebaPorId(id: string): Promise<UsuarioPrueba | null> {
  const db = createServiceClient();
  const { data } = await (db as any)
    .from("usuarios_prueba")
    .select("*")
    .eq("id", id)
    .maybeSingle() as { data: UsuarioPrueba | null };
  return data;
}

// ── Reset ECMatic ────────────────────────────────────────────────────────────
// Patrón idéntico al sandbox: primero FK sin cascade, luego lead (cascade limpia el resto)

export async function resetLeadECMatic(
  telefono: string,
  ghlContactId: string | null
): Promise<{ borrado: boolean }> {
  const db = createServiceClient();

  const { data: lead } = await db
    .from("leads")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (!lead) return { borrado: false };

  await db.from("pagos").delete().eq("lead_id", lead.id);
  await db.from("leads").delete().eq("id", lead.id);

  // Limpiar ghl_campana_logs por contact_id para permitir re-inscripción
  if (ghlContactId) {
    await (db as any)
      .from("ghl_campana_logs")
      .delete()
      .eq("ghl_contact_id", ghlContactId);
  }

  return { borrado: true };
}

// ── Cachear ghl_contact_id ───────────────────────────────────────────────────

export async function actualizarGhlContactId(id: string, ghlContactId: string): Promise<void> {
  const db = createServiceClient();
  await (db as any)
    .from("usuarios_prueba")
    .update({ ghl_contact_id: ghlContactId, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// ── Verificar si teléfono es usuario de prueba (para leads.ts) ─────────────

export async function esUsuarioPrueba(telefono: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await (db as any)
    .from("usuarios_prueba")
    .select("id")
    .eq("telefono", telefono)
    .eq("activo", true)
    .maybeSingle() as { data: { id: string } | null };
  return !!data;
}
