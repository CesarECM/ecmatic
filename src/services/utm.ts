import { createServiceClient } from "@/lib/supabase/service";
import { enviarBienvenida } from "@/lib/email/transaccional";

export interface DatosUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  ip_address?: string;
}

export interface DatosTrackLead extends DatosUtm {
  telefono: string;
  nombre?: string;
  email?: string;
  privacidad_aceptada?: boolean;
}

// Deriva el canal_origen del lead a partir del utm_source
function canalDesdeUtm(source?: string): string {
  if (!source) return "web";
  const s = source.toLowerCase();
  if (s.includes("facebook") || s.includes("fb")) return "facebook_ad";
  if (s.includes("instagram") || s.includes("ig")) return "instagram_ad";
  if (s.includes("google") || s.includes("gads")) return "google_ad";
  if (s.includes("tiktok")) return "tiktok_ad";
  return "web";
}

// Guarda UTM para un lead ya existente
export async function registrarUtm(leadId: string, datos: DatosUtm): Promise<void> {
  const db = createServiceClient();
  await db.from("utm_sources").insert({ lead_id: leadId, ...datos });
}

// Encuentra o crea el lead y registra su UTM. Usado por el endpoint público.
export async function trackLead(datos: DatosTrackLead): Promise<{ leadId: string; nuevo: boolean }> {
  const db = createServiceClient();

  const { data: existente } = await db
    .from("leads")
    .select("id, canal_origen")
    .eq("telefono", datos.telefono)
    .maybeSingle();

  let leadId: string;
  let nuevo = false;

  if (existente) {
    leadId = existente.id;
    // Solo sobreescribe canal_origen si venía de whatsapp (sin atribución previa)
    if (existente.canal_origen === "whatsapp" && datos.utm_source) {
      await db
        .from("leads")
        .update({ canal_origen: canalDesdeUtm(datos.utm_source) })
        .eq("id", leadId);
    }
  } else {
    const canal = canalDesdeUtm(datos.utm_source);
    const privFecha = datos.privacidad_aceptada ? new Date().toISOString() : null;
    const { data: creado, error } = await db
      .from("leads")
      .insert({
        telefono: datos.telefono,
        nombre: datos.nombre ?? null,
        email: datos.email ?? null,
        canal_origen: canal,
        privacidad_aceptada: datos.privacidad_aceptada ?? false,
        privacidad_fecha: privFecha,
      })
      .select("id")
      .single();

    if (error) throw new Error(`[utm] Error creando lead: ${error.message}`);
    leadId = creado.id;
    nuevo = true;

    if (datos.email && datos.nombre) {
      void enviarBienvenida({ nombre: datos.nombre, email: datos.email });
    }
  }

  const { utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip_address } = datos;
  await registrarUtm(leadId, {
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip_address,
  });

  return { leadId, nuevo };
}
