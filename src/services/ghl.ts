import { createServiceClient } from "@/lib/supabase/service";
import { registrarUtm } from "@/services/utm";
import { enviarBienvenida } from "@/lib/email/transaccional";
import { verificarBlacklist } from "@/services/limpieza-leads";
import { asignarEtiqueta } from "@/services/etiquetas";

// GHL envía dos variantes del payload: anidado (contact: {...}) y plano.
// Soportamos ambas defensivamente.
export interface GHLWebhookPayload {
  type?: string;
  // Nested format
  contact?: {
    id?: string;
    name?: string;
    firstName?: string;
    first_name?: string;
    lastName?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    source?: string;
    tags?: string[];
    utmSource?: string;
    utm_source?: string;
    utmMedium?: string;
    utm_medium?: string;
    utmCampaign?: string;
    utm_campaign?: string;
    utmContent?: string;
    utm_content?: string;
    utmTerm?: string;
    utm_term?: string;
  };
  // Flat format
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

function normalizarTelefono(raw?: string): string | null {
  if (!raw) return null;
  const limpio = raw.replace(/^\+/, "").replace(/[\s\-().]/g, "");
  return limpio.length >= 7 ? limpio : null;
}

function canalDesdeSource(source?: string, utmSource?: string): string {
  const s = (source ?? utmSource ?? "").toLowerCase();
  if (s.includes("facebook") || s.includes("fb")) return "facebook_ad";
  if (s.includes("instagram") || s.includes("ig")) return "instagram_ad";
  if (s.includes("google") || s.includes("gads")) return "google_ad";
  if (s.includes("tiktok")) return "tiktok_ad";
  return "ghl";
}

export async function procesarContactoGHL(payload: GHLWebhookPayload): Promise<void> {
  const c = payload.contact ?? {};

  const primerNombre = c.firstName ?? c.first_name ?? payload.first_name;
  const apellido = c.lastName ?? c.last_name ?? payload.last_name;
  const nombre = c.name ?? payload.name
    ?? (primerNombre ? `${primerNombre}${apellido ? ` ${apellido}` : ""}`.trim() : null);

  const email = c.email ?? payload.email ?? null;
  const telefonoRaw = c.phone ?? payload.phone;
  const source = c.source ?? payload.source;
  const utmSource = c.utmSource ?? c.utm_source ?? payload.utm_source;
  const utmMedium = c.utmMedium ?? c.utm_medium ?? payload.utm_medium;
  const utmCampaign = c.utmCampaign ?? c.utm_campaign ?? payload.utm_campaign;
  const utmContent = c.utmContent ?? c.utm_content ?? payload.utm_content;
  const utmTerm = c.utmTerm ?? c.utm_term ?? payload.utm_term;

  const telefono = normalizarTelefono(telefonoRaw);
  if (!telefono) {
    console.warn("[ghl] Contacto sin teléfono válido — omitido");
    return;
  }

  const enBlacklist = await verificarBlacklist(telefono).catch(() => false);
  if (enBlacklist) return;

  const supabase = createServiceClient();
  const canal = canalDesdeSource(source, utmSource);

  const { data: existente } = await supabase
    .from("leads")
    .select("id, canal_origen, nombre, email")
    .eq("telefono", telefono)
    .maybeSingle();

  let leadId: string;

  if (existente) {
    leadId = existente.id;
    const updates: { nombre?: string; email?: string; canal_origen?: string } = {};
    if (!existente.nombre && nombre) updates.nombre = nombre;
    if (!existente.email && email) updates.email = email;
    // Sobreescribe canal solo si era whatsapp sin atribución previa
    if (existente.canal_origen === "whatsapp" && canal !== "ghl") {
      updates.canal_origen = canal;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("leads").update(updates).eq("id", leadId);
    }
  } else {
    const { data: nuevo, error } = await supabase
      .from("leads")
      .insert({
        telefono,
        nombre: nombre ?? null,
        email: email ?? null,
        canal_origen: canal,
      })
      .select("id")
      .single();

    if (error) throw new Error(`[ghl] Error creando lead: ${error.message}`);
    leadId = nuevo.id;

    if (email && nombre) {
      void enviarBienvenida({ nombre, email });
    }
  }

  if (utmSource ?? utmMedium ?? utmCampaign) {
    await registrarUtm(leadId, {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
    });
  }

  // S16.6 — etiquetado automático
  const tagsGHL = c.tags ?? payload.tags ?? [];
  void etiquetarLeadGHL(leadId, tagsGHL);
}

// Asigna etiqueta "GHL" en Origen + mapea tags GHL a etiquetas ECMatic.
// Tags nuevas quedan como pendiente_revision para aprobación del admin.
async function etiquetarLeadGHL(leadId: string, tagsGHL: string[]): Promise<void> {
  const supabase = createServiceClient();

  // 1. Etiqueta de origen "GHL" — activa automáticamente
  const { data: catOrigen } = await supabase
    .from("etiqueta_categorias")
    .select("id")
    .eq("nombre", "Origen")
    .maybeSingle();

  if (catOrigen) {
    const { data: etqExistente } = await supabase
      .from("etiquetas")
      .select("id")
      .eq("categoria_id", catOrigen.id)
      .eq("nombre", "GHL")
      .maybeSingle();

    let origenId: string | null = etqExistente?.id ?? null;
    if (!origenId) {
      const { data: nueva } = await supabase
        .from("etiquetas")
        .insert({
          categoria_id: catOrigen.id,
          nombre: "GHL",
          descripcion: "Lead proveniente de GoHighLevel",
          origen: "automatico",
          estado: "activa",
        })
        .select("id")
        .single();
      origenId = nueva?.id ?? null;
    }
    if (origenId) await asignarEtiqueta(leadId, origenId, "automatico");
  }

  // 2. Tags de GHL → etiquetas ECMatic
  if (!tagsGHL.length) return;

  const { data: catGestion } = await supabase
    .from("etiqueta_categorias")
    .select("id")
    .eq("nombre", "Gestión")
    .maybeSingle();

  if (!catGestion) return;

  for (const tag of tagsGHL) {
    const nombre = tag.trim();
    if (!nombre) continue;

    // Buscar en todas las categorías (case-insensitive, no archivadas)
    const { data: existente } = await supabase
      .from("etiquetas")
      .select("id, estado")
      .ilike("nombre", nombre)
      .neq("estado", "archivada")
      .maybeSingle();

    if (existente) {
      // Solo asignar si ya está activa; las pendiente_revision las maneja el admin
      if (existente.estado === "activa") {
        await asignarEtiqueta(leadId, existente.id, "automatico");
      }
      continue;
    }

    // Crear nueva en Gestión como pendiente_revision
    const { data: nueva } = await supabase
      .from("etiquetas")
      .insert({
        categoria_id: catGestion.id,
        nombre,
        descripcion: `Tag importado desde GHL`,
        origen: "automatico",
        estado: "pendiente_revision",
      })
      .select("id")
      .single();

    if (nueva) await asignarEtiqueta(leadId, nueva.id, "automatico");
  }
}
