// S34.5 — Wrapper Meta Graph API para gestión de templates WA
import type { ComponenteTemplate, CategoriaWaTemplate } from "@/services/wa-templates";

const BASE_URL = "https://graph.facebook.com/v20.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WABA_ID = process.env.WHATSAPP_WABA_ID!;

interface MetaTemplateResponse {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
  category: string;
}

interface MetaErrorResponse {
  error?: { message: string; type: string; code: number };
}

async function metaRequest(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as MetaErrorResponse;
  if (!res.ok) {
    throw new Error(
      `Meta API error ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`
    );
  }
  return json;
}

// Crea el template en Meta Business Manager. Devuelve el meta_template_id asignado.
export async function crearTemplateEnMeta(params: {
  nombre: string;
  categoria: CategoriaWaTemplate;
  idioma: string;
  componentes: ComponenteTemplate[];
}): Promise<{ metaId: string }> {
  const payload = {
    name: params.nombre.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
    category: params.categoria,
    language: params.idioma,
    components: params.componentes,
  };

  const data = (await metaRequest(
    "POST",
    `/${WABA_ID}/message_templates`,
    payload
  )) as MetaTemplateResponse;

  return { metaId: data.id };
}

// Consulta el estado actual de un template en Meta por su meta_template_id.
export async function consultarEstadoTemplate(
  metaTemplateId: string
): Promise<{ status: MetaTemplateResponse["status"] }> {
  const data = (await metaRequest(
    "GET",
    `/${metaTemplateId}?fields=status`
  )) as MetaTemplateResponse;

  return { status: data.status };
}

// Elimina un template en Meta. Solo funciona si está en DRAFT o REJECTED.
export async function eliminarTemplateEnMeta(metaTemplateId: string): Promise<void> {
  await metaRequest("DELETE", `/${WABA_ID}/message_templates?name=${metaTemplateId}`);
}

// Envía un template aprobado como mensaje WA a un número.
export async function enviarTemplateMensaje(params: {
  to: string;
  templateNombre: string;
  idioma: string;
  phoneId?: string;
}): Promise<void> {
  const phoneId = params.phoneId ?? process.env.WHATSAPP_PHONE_NUMBER_ID!;
  await metaRequest("POST", `/${phoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "template",
    template: {
      name: params.templateNombre.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
      language: { code: params.idioma },
    },
  });
}
