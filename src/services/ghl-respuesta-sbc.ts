import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";
import { agregarTagsContacto } from "@/lib/ghl/contacts-api";
import { buscarConversacionWA, enviarMensajeGHL } from "@/lib/ghl/conversations-api";
import { registrarRespuestaGHL } from "@/services/ab-workflows-ghl";

const CAMPANA_ACTIVA = "sbc_jun26";

// Palabras clave de botones de respuesta negativa
const TEXTOS_NEGATIVOS = [
  "ya no me interesa", "no me interesa", "no quiero",
  "cancelar", "dar de baja", "stop", "no gracias",
];
// Palabras clave de botones positivos
const TEXTOS_POSITIVOS = [
  "sí, esta semana", "si, esta semana", "cuéntame más", "cuéntame mas",
  "sí quiero", "si quiero", "me interesa", "cómo funciona", "como funciona",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function procesarMensajeEntranteSBC(payload: any): Promise<void> {
  const contactId      = payload.contactId as string | undefined;
  const conversationId = payload.conversationId as string | undefined;
  const cuerpo         = ((payload.body ?? payload.message ?? payload.text ?? "") as string).toLowerCase().trim();

  if (!contactId || !cuerpo) return;

  // Verificar que este contacto está en nuestra campaña activa
  const supabase = createServiceClient();
  const { data: log } = await (supabase as any)
    .from("ghl_campana_logs")
    .select("id, variante, enviado")
    .eq("ghl_contact_id", contactId)
    .eq("campana", CAMPANA_ACTIVA)
    .maybeSingle() as { data: { id: string; variante: "a" | "b"; enviado: boolean } | null };

  if (!log?.enviado) return; // No es contacto de la campaña o no recibió el template

  // Clasificar intención del mensaje
  const esNegativo = TEXTOS_NEGATIVOS.some((t) => cuerpo.includes(t));
  const esPositivo = TEXTOS_POSITIVOS.some((t) => cuerpo.includes(t)) || !esNegativo;

  if (esNegativo) {
    // Blacklist + respuesta de cierre amable
    await agregarTagsContacto(contactId, ["ecm_blacklist", "ecm_sbc_descartado"]).catch(() => null);
    await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, "negativo");

    const convId = conversationId ?? (await buscarConversacionWA(contactId).catch(() => null))?.id;
    if (convId) {
      await enviarMensajeGHL(convId,
        "Entendido, no hay problema. Si en algún momento reconsideras tu certificación EC0217.01, aquí estaremos. Que te vaya muy bien."
      ).catch(() => null);
    }
    return;
  }

  // Respuesta positiva o neutra → generar respuesta con Sonnet
  await registrarRespuestaGHL(contactId, CAMPANA_ACTIVA, esPositivo ? "positivo" : "neutro");

  const convId = conversationId ?? (await buscarConversacionWA(contactId).catch(() => null))?.id;
  if (!convId) return;

  const linkPago = process.env.SBC_PAGO_URL ?? "https://ceecm.mx/smartbuilder";
  const mensajeOriginal = payload.body ?? payload.message ?? payload.text ?? "";

  const respuesta = await generarRespuestaSBC(mensajeOriginal, linkPago).catch(() => null);
  if (respuesta) {
    await enviarMensajeGHL(convId, respuesta).catch(() => null);
  }
}

async function generarRespuestaSBC(mensajeLead: string, linkPago: string): Promise<string> {
  const system = `Eres César de Centro ECM (ceecm.mx). Estás respondiendo por WhatsApp a alguien interesado en SmartBuilderEC — la forma más rápida de completar tu EC0217.01 con IA en 48 horas, por $1,799 MXN.

REGLAS WhatsApp:
- Máximo 2 párrafos cortos
- Sin listas ni asteriscos
- Tono: directo, cálido, experto en certificaciones CONOCER
- Si el lead pregunta precio: mencionalo ($1,799 MXN)
- Si el lead está listo para pagar: envía el link al final: ${linkPago}
- Si tiene dudas: responde brevemente y pregunta qué le genera dudas

No menciones "IA" directamente — habla de "nuestro sistema" o "la plataforma".`;

  const resp = await callClaudeIA(
    "RESPUESTA_GHL_SBC",
    {
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: mensajeLead }],
    }
  );
  return (resp.content[0] as { text: string }).text.trim();
}
