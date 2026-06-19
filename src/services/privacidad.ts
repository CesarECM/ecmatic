import { createServiceClient } from "@/lib/supabase/service";

// Palabras clave que indican aceptación explícita del aviso de privacidad
const PALABRAS_ACEPTACION = [
  "si acepto", "sí acepto", "acepto", "de acuerdo", "ok acepto", "aceptar",
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function detectarAceptacion(texto: string): boolean {
  const norm = normalizar(texto);
  return PALABRAS_ACEPTACION.some((kw) => norm.includes(normalizar(kw)));
}

export async function marcarPrivacidadAceptada(leadId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("leads")
    .update({ privacidad_aceptada: true, privacidad_fecha: new Date().toISOString() })
    .eq("id", leadId);
}

export function mensajeAvisoPrivacidad(): string {
  const url = process.env.PRIVACY_URL ?? "https://ceecm.mx/aviso-privacidad";
  return (
    `Para brindarte atención personalizada, trataremos tus datos conforme a la LFPDPPP. ` +
    `Consulta nuestro Aviso de Privacidad en: ${url}\n` +
    `Responde "SÍ ACEPTO" para confirmar tu consentimiento.`
  );
}
