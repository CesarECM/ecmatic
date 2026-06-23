// S34.3 — CRON diario 7am: ejecuta pasos de secuencias de prospección omnicanal
import { createServiceClient } from "@/lib/supabase/service";
import { enviarTemplateMensaje } from "@/lib/whatsapp/templates-api";
import { seleccionarImagenParaTemplate, registrarEnvioImagen } from "./ab-imagenes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

interface ContactoSecuencia {
  id: string;
  lead_id: string;
  secuencia_id: string;
  paso_actual_orden: number;
  estado: "activo" | "completado" | "pausado";
  iniciado_at: string;
  ultimo_paso_at: string | null;
}

interface PasoSecuencia {
  id: string;
  secuencia_id: string;
  orden: number;
  canal: "email" | "whatsapp";
  delay_dias: number;
  condicion_trigger: "siempre" | "sin_respuesta";
  template_wa_id: string | null;
  asunto_email: string | null;
  cuerpo_email: string | null;
}

interface LeadInfo {
  telefono: string | null;
  email: string | null;
  nombre: string | null;
}

// Verifica si el lead respondió desde una fecha dada
async function tieneRespuestaDesde(leadId: string, desde: string): Promise<boolean> {
  const { data } = await db()
    .from("mensajes")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direccion", "entrante")
    .gte("created_at", desde)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

// Envía email básico via Resend (graceful degradation si no hay key)
async function enviarEmail(params: {
  to: string;
  asunto: string;
  cuerpo: string;
  nombre: string | null;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[prospeccion-secuencial] RESEND_API_KEY no configurada, omitiendo email");
    return false;
  }
  const body = params.cuerpo.replace(/\{nombre\}/gi, params.nombre ?? "");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Centro ECM <no-reply@ceecm.mx>",
      to: params.to,
      subject: params.asunto,
      text: body,
    }),
  });
  return res.ok;
}

// Ejecuta un paso de la secuencia para un contacto
async function ejecutarPaso(
  contacto: ContactoSecuencia,
  paso: PasoSecuencia,
  lead: LeadInfo
): Promise<boolean> {
  if (paso.canal === "whatsapp") {
    if (!lead.telefono || !paso.template_wa_id) return false;
    const { data: tmpl } = await db()
      .from("wa_templates")
      .select("nombre, idioma, estado_meta")
      .eq("id", paso.template_wa_id)
      .maybeSingle();
    if (!tmpl || tmpl.estado_meta !== "APPROVED") return false;

    const imagenId = await seleccionarImagenParaTemplate(paso.template_wa_id);
    await enviarTemplateMensaje({
      to: lead.telefono,
      templateNombre: tmpl.nombre,
      idioma: tmpl.idioma,
    });
    await registrarEnvioImagen(paso.template_wa_id, imagenId ?? "");
    return true;
  }

  if (paso.canal === "email") {
    if (!lead.email || !paso.cuerpo_email) return false;
    return enviarEmail({
      to: lead.email,
      asunto: paso.asunto_email ?? "Centro ECM — Mensaje importante",
      cuerpo: paso.cuerpo_email,
      nombre: lead.nombre,
    });
  }

  return false;
}

export async function ejecutarSecuencias(): Promise<{
  procesados: number;
  enviados: number;
  completados: number;
  errores: number;
}> {
  const result = { procesados: 0, enviados: 0, completados: 0, errores: 0 };

  const { data: contactos } = await db()
    .from("prospeccion_contacto_secuencia")
    .select("*")
    .eq("estado", "activo") as { data: ContactoSecuencia[] | null };

  if (!contactos?.length) return result;

  for (const contacto of contactos) {
    result.procesados++;
    try {
      // Obtener el paso actual
      const { data: paso } = await db()
        .from("prospeccion_secuencia_pasos")
        .select("*")
        .eq("secuencia_id", contacto.secuencia_id)
        .eq("orden", contacto.paso_actual_orden)
        .maybeSingle() as { data: PasoSecuencia | null };

      if (!paso) {
        // No hay más pasos → completar
        await db()
          .from("prospeccion_contacto_secuencia")
          .update({ estado: "completado", updated_at: new Date().toISOString() })
          .eq("id", contacto.id);
        result.completados++;
        continue;
      }

      // Verificar que haya pasado el delay
      const referencia = contacto.ultimo_paso_at ?? contacto.iniciado_at;
      const diasTranscurridos =
        (Date.now() - new Date(referencia).getTime()) / 86_400_000;
      if (diasTranscurridos < paso.delay_dias) continue;

      // Verificar condición
      if (paso.condicion_trigger === "sin_respuesta") {
        const respondio = await tieneRespuestaDesde(contacto.lead_id, referencia);
        if (respondio) {
          // El lead respondió → completar secuencia
          await db()
            .from("prospeccion_contacto_secuencia")
            .update({ estado: "completado", updated_at: new Date().toISOString() })
            .eq("id", contacto.id);
          result.completados++;
          continue;
        }
      }

      // Obtener datos del lead
      const { data: lead } = await db()
        .from("leads")
        .select("telefono, email, nombre")
        .eq("id", contacto.lead_id)
        .maybeSingle() as { data: LeadInfo | null };

      if (!lead) continue;

      const ok = await ejecutarPaso(contacto, paso, lead);
      if (!ok) continue;

      result.enviados++;

      // Avanzar al siguiente paso
      const siguienteOrden = contacto.paso_actual_orden + 1;
      const { data: siguientePaso } = await db()
        .from("prospeccion_secuencia_pasos")
        .select("id")
        .eq("secuencia_id", contacto.secuencia_id)
        .eq("orden", siguienteOrden)
        .maybeSingle();

      if (!siguientePaso) {
        await db()
          .from("prospeccion_contacto_secuencia")
          .update({ estado: "completado", updated_at: new Date().toISOString() })
          .eq("id", contacto.id);
        result.completados++;
      } else {
        await db()
          .from("prospeccion_contacto_secuencia")
          .update({
            paso_actual_orden: siguienteOrden,
            ultimo_paso_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", contacto.id);
      }
    } catch (err) {
      console.error("[prospeccion-secuencial] error en contacto", contacto.id, err);
      result.errores++;
    }
  }

  return result;
}
