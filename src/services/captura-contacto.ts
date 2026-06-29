// S20.5 — Captura pasiva de contacto: detecta email y nombre en el texto
// del lead sin preguntar directamente. Actualiza el perfil del lead en silencio.
// S44.2 — Cuando se captura un dato nuevo, lo sincroniza también en GHL.

import { createServiceClient } from "@/lib/supabase/service";
import { enviarBienvenida } from "@/lib/email/transaccional";
import { buscarOCrearContactoGHL, actualizarDatosContactoGHL } from "@/lib/ghl/contacts-api";
import { logSistema } from "@/services/log-sistema";

// ── Extractores ───────────────────────────────────────────────────────────

const RE_EMAIL = /\b[\w.+%-]+@[\w-]+\.[a-z]{2,7}\b/i;

// Patrones de autopresentación en español
const PATRONES_NOMBRE = [
  /me\s+llamo\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
  /soy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
  /mi\s+nombre\s+es\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
  /me\s+puede[ns]?\s+llamar\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
];

// Dominios descartables (prueba/temporales)
const DOMINIOS_DUMMY = ["test.com", "example.com", "correo.com", "mail.com", "prueba.com"];

export function extraerEmail(texto: string): string | null {
  const match = texto.match(RE_EMAIL);
  if (!match) return null;
  const email = match[0].toLowerCase();
  const dominio = email.split("@")[1];
  if (DOMINIOS_DUMMY.includes(dominio)) return null;
  return email;
}

export function extraerNombre(texto: string): string | null {
  for (const patron of PATRONES_NOMBRE) {
    const match = texto.match(patron);
    if (match?.[1]) {
      const nombre = match[1].trim();
      // Descartar si capturó una stopword común
      if (["un", "el", "la", "los", "las", "una"].includes(nombre.toLowerCase())) continue;
      return nombre;
    }
  }
  return null;
}

// ── Orquestador ───────────────────────────────────────────────────────────

export interface ResultadoCapturaContacto {
  emailCapturado: boolean;
  nombreCapturado: boolean;
}

// Escanea los mensajes entrantes y actualiza silenciosamente el perfil del lead.
// Solo actualiza campos que aún son null (no sobreescribe datos previos).
export async function capturarContactoPasivo(
  leadId: string,
  mensajesEntrantes: string[]
): Promise<ResultadoCapturaContacto> {
  const resultado: ResultadoCapturaContacto = { emailCapturado: false, nombreCapturado: false };

  try {
    const supabase = createServiceClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("nombre, email, telefono")
      .eq("id", leadId)
      .single();

    if (!lead) return resultado;

    const textoCompleto = mensajesEntrantes.join(" ");
    const actualizaciones: { email?: string; nombre?: string } = {};

    // Capturar email solo si el lead aún no tiene uno
    if (!lead.email) {
      const email = extraerEmail(textoCompleto);
      if (email) {
        actualizaciones.email = email;
        resultado.emailCapturado = true;
      }
    }

    // Capturar nombre solo si el lead aún no tiene uno
    if (!lead.nombre) {
      const nombre = extraerNombre(textoCompleto);
      if (nombre) {
        actualizaciones.nombre = nombre;
        resultado.nombreCapturado = true;
      }
    }

    if (Object.keys(actualizaciones).length === 0) return resultado;

    await supabase.from("leads").update(actualizaciones).eq("id", leadId);

    // Si se capturó email por primera vez, enviar bienvenida transaccional
    if (resultado.emailCapturado) {
      const nombreFinal = actualizaciones.nombre ?? lead.nombre ?? null;
      void enviarBienvenida({ nombre: nombreFinal, email: actualizaciones.email! }).catch(() => {});
    }

    // S44.2 — Sincronizar datos nuevos en GHL (fire-and-forget)
    if (lead.telefono) {
      void sincronizarEnGHL(leadId, lead.telefono, actualizaciones).catch(() => {});
    }
  } catch (err) {
    console.error("[captura-contacto] Error:", err);
  }

  return resultado;
}

// S44.2/S44.3 — Empuja campos recién capturados al contacto en GHL.
// Solo envía lo que ECMatic acaba de capturar; nunca sobreescribe datos previos en GHL.
async function sincronizarEnGHL(
  leadId: string,
  telefono: string,
  campos: { nombre?: string; email?: string }
): Promise<void> {
  const contactId = await buscarOCrearContactoGHL(telefono).catch(() => null);
  if (!contactId) return;

  const ghlCampos: { firstName?: string; lastName?: string; email?: string } = {};

  if (campos.nombre) {
    const partes = campos.nombre.trim().split(/\s+/);
    ghlCampos.firstName = partes[0];
    if (partes.length > 1) ghlCampos.lastName = partes.slice(1).join(" ");
  }

  if (campos.email) ghlCampos.email = campos.email;

  if (!Object.keys(ghlCampos).length) return;

  const ok = await actualizarDatosContactoGHL(contactId, ghlCampos);

  await logSistema({
    categoria: "servicio",
    tipoAccion: "ghl.sync_contacto",
    fase: ok ? "ok" : "error",
    leadId,
    resultado: ok
      ? `Campos sincronizados: ${Object.keys(ghlCampos).join(", ")}`
      : "actualizarDatosContactoGHL devolvió false",
    metadata: { contactId, campos: Object.keys(ghlCampos) },
  });
}
