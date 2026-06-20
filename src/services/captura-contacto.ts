// S20.5 — Captura pasiva de contacto: detecta email y nombre en el texto
// del lead sin preguntar directamente. Actualiza el perfil del lead en silencio.

import { createServiceClient } from "@/lib/supabase/service";
import { enviarBienvenida } from "@/lib/email/transaccional";

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
      .select("nombre, email")
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
  } catch (err) {
    console.error("[captura-contacto] Error:", err);
  }

  return resultado;
}
