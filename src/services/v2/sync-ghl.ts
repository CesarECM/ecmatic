import { createServiceClient } from "@/lib/supabase/service";
import { analizarOportunidad } from "./loop-analizar";
import type { GHLWebhookPayload } from "@/services/ghl";

function normalizarTelefono(raw?: string): string | null {
  if (!raw) return null;
  const limpio = raw.replace(/^\+/, "").replace(/[\s\-().]/g, "");
  return limpio.length >= 7 ? limpio : null;
}

function origenDesdeSource(source?: string): "whatsapp" | "ghl" {
  const s = (source ?? "").toLowerCase();
  return s.includes("whatsapp") ? "whatsapp" : "ghl";
}

// Retorna true si el lead tiene contact_points que aún requieren acción del usuario
async function tieneTareasPendientes(db: any, leadId: string): Promise<boolean> {
  const { count } = await db
    .from("v2_contact_points")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .in("estado", ["pendiente_generacion", "generado"]);
  return (count ?? 0) > 0;
}

// Devuelve el id de la oportunidad activa del lead, o la crea si no existe
async function obtenerOCrearOportunidad(db: any, leadId: string): Promise<string> {
  const { data: existente } = await db
    .from("v2_opportunities")
    .select("id")
    .eq("lead_id", leadId)
    .eq("estado", "activa")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existente) return existente.id;

  const { data: nueva, error } = await db
    .from("v2_opportunities")
    .insert({
      lead_id:   leadId,
      fase_cagc: "conciencia",
      estado:    "activa",
    })
    .select("id")
    .single();

  if (error || !nueva) throw new Error(`sync-ghl: no se pudo crear oportunidad: ${error?.message}`);
  return nueva.id;
}

// Upsert de v2_lead por ghl_contact_id. Devuelve el id del lead.
async function upsertLeadV2(
  db:           any,
  ghlContactId: string,
  nombre:       string | null,
  telefono:     string | null,
  email:        string | null,
  origen:       "whatsapp" | "ghl",
): Promise<string> {
  // 1. Buscar por ghl_contact_id
  const { data: porId } = await db
    .from("v2_leads")
    .select("id, nombre, telefono, email")
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();

  if (porId) {
    const updates: Record<string, unknown> = {};
    if (!porId.nombre && nombre) updates.nombre = nombre;
    if (!porId.telefono && telefono) updates.telefono = telefono;
    if (!porId.email && email) updates.email = email;
    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      await db.from("v2_leads").update(updates).eq("id", porId.id);
    }
    return porId.id;
  }

  // 2. Buscar por teléfono (evita duplicados si llegó sin ghl_contact_id antes)
  if (telefono) {
    const { data: porTel } = await db
      .from("v2_leads")
      .select("id")
      .eq("telefono", telefono)
      .maybeSingle();

    if (porTel) {
      await db.from("v2_leads").update({
        ghl_contact_id: ghlContactId,
        ...(nombre ? { nombre } : {}),
        ...(email  ? { email }  : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", porTel.id);
      return porTel.id;
    }
  }

  // 3. Crear nuevo
  const { data: nuevo, error } = await db
    .from("v2_leads")
    .insert({
      ghl_contact_id: ghlContactId,
      nombre,
      telefono,
      email,
      origen,
      estado: "activo",
    })
    .select("id")
    .single();

  if (error || !nuevo) throw new Error(`sync-ghl: error creando v2_lead: ${error?.message}`);
  return nuevo.id;
}

// ── ContactCreate / ContactUpdate ─────────────────────────────────────────────
// Disparado desde webhook para eventos de contacto GHL.
// Upsert v2_lead + crea oportunidad si no existe + dispara análisis CAGC.
export async function sincronizarContactoV2(
  payload: GHLWebhookPayload,
  tipo:    string,
): Promise<void> {
  const c = payload.contact ?? {};

  const ghlContactId = c.id ?? payload.contact_id;
  if (!ghlContactId) return;

  const primerNombre = c.firstName ?? c.first_name ?? payload.first_name;
  const apellido     = c.lastName  ?? c.last_name  ?? payload.last_name;
  const nombre       = c.name ?? payload.name
    ?? (primerNombre ? `${primerNombre}${apellido ? ` ${apellido}` : ""}`.trim() : null) ?? null;
  const email        = c.email ?? payload.email ?? null;
  const telefono     = normalizarTelefono(c.phone ?? payload.phone);
  const origen       = origenDesdeSource(c.source ?? payload.source);

  const db = createServiceClient() as any;
  const leadId = await upsertLeadV2(db, ghlContactId, nombre, telefono, email, origen);

  // Para cualquier evento de contacto: garantizar que el lead tenga oportunidad
  const opId = await obtenerOCrearOportunidad(db, leadId);

  // Solo disparar análisis en eventos de creación o si ya no hay tareas pendientes
  const esCreacion = tipo.toLowerCase().includes("create") || tipo.toLowerCase().includes("created");
  if (esCreacion || !(await tieneTareasPendientes(db, leadId))) {
    await analizarOportunidad(opId);
  }
}

// ── InboundMessage ────────────────────────────────────────────────────────────
// Disparado cuando GHL recibe un mensaje entrante de un lead.
// Actualiza v2_lead (si existe en v1.7) y dispara re-análisis CAGC.
export async function sincronizarMensajeEntranteV2(ghlContactId: string): Promise<void> {
  if (!ghlContactId) return;

  const db = createServiceClient() as any;

  // 1. Buscar v2_lead
  let leadId: string | null = null;
  const { data: v2Lead } = await db
    .from("v2_leads")
    .select("id")
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();

  if (v2Lead) {
    leadId = v2Lead.id;
  } else {
    // 2. Buscar en tabla leads de v1.7 para heredar datos
    const { data: v1Lead } = await db
      .from("leads")
      .select("id, nombre, telefono, email")
      .eq("ghl_contact_id", ghlContactId)
      .maybeSingle();

    if (v1Lead?.telefono) {
      leadId = await upsertLeadV2(
        db,
        ghlContactId,
        v1Lead.nombre ?? null,
        v1Lead.telefono,
        v1Lead.email ?? null,
        "whatsapp",
      );
    }
  }

  // Si el lead no existe en ninguna tabla, esperar al ContactCreate
  if (!leadId) return;

  // S152.3 — Reactivar oportunidades INACTIVAS si el lead escribe de vuelta
  await db.from("v2_opportunities")
    .update({ estado: "activa", updated_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("estado", "INACTIVA");

  // 3. Garantizar oportunidad activa
  const opId = await obtenerOCrearOportunidad(db, leadId);

  // 4. Re-analizar solo si no hay tareas en cola (evita duplicar contact_points)
  if (!(await tieneTareasPendientes(db, leadId))) {
    await analizarOportunidad(opId);
  }
}
