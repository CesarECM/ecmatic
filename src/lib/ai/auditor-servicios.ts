// Auditor IA de servicios — analiza un servicio y genera sugerencias de negocio:
// crear, editar, unir, separar o eliminar servicios.
// Se dispara fire-and-forget en cada operación CRUD sobre un servicio.

import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";
import type { Servicio } from "@/services/servicios";

export type TipoCambioServicio = "crear" | "editar" | "eliminar";

export interface SugerenciaAuditorServicio {
  accion: "crear" | "editar" | "unir" | "separar" | "eliminar" | "completar_campo";
  titulo: string;
  descripcion: string;
  servicio_ids_afectados: string[];
  urgencia: "alta" | "media" | "baja";
}

interface ServicioResumen {
  id: string;
  titulo: string;
  contenido: string;
}

export async function auditarServicio(
  servicio: Servicio,
  catalogo: ServicioResumen[],
  tipo_cambio: TipoCambioServicio
): Promise<SugerenciaAuditorServicio[]> {
  const otros = catalogo.filter(s => s.id !== servicio.id);

  const systemPrompt = `Eres el Auditor de Servicios de ECMatic, un CRM para un centro de certificación CONOCER en México.
Tu trabajo es analizar el catálogo de servicios y detectar oportunidades de mejora: servicios mal nombrados, duplicados, que debería separarse en varios, o que les faltan datos clave.

Reglas de negocio:
- Un servicio con múltiples estándares CONOCER (EC0xxx) en el nombre probablemente debería separarse.
- Si detectas que este servicio se puede mantener como bundle, sugiere también un nombre comercial atractivo para el bundle.
- Si hay servicios muy similares en el catálogo, sugiere unirlos.
- Campos críticos vacíos: para_quien_es, beneficios, precio_centavos.
- Si el título es demasiado técnico, sugiere uno más comercial.

Responde SOLO en JSON con este formato exacto:
{
  "sugerencias": [
    {
      "accion": "separar|unir|editar|crear|eliminar|completar_campo",
      "titulo": "Título de la sugerencia",
      "descripcion": "Descripción accionable de qué hacer y por qué",
      "servicio_ids_afectados": ["uuid1", "uuid2"],
      "urgencia": "alta|media|baja"
    }
  ]
}
Si no hay sugerencias, responde: {"sugerencias": []}`;

  const userContent = `SERVICIO AUDITADO (acción: ${tipo_cambio}):
ID: ${servicio.id}
Título: ${servicio.titulo}
Descripción: ${servicio.contenido}
Estándar CONOCER: ${servicio.estandar_conocer ?? "No especificado"}
Para quién es: ${servicio.para_quien_es ?? "Vacío"}
Beneficios: ${servicio.beneficios ?? "Vacío"}
Precio: ${servicio.precio_centavos ? `$${servicio.precio_centavos / 100} MXN` : "Sin precio"}
Activo: ${servicio.activo ? "Sí" : "No"}

CATÁLOGO ACTUAL (${otros.length} servicios):
${otros.map(s => `- [${s.id}] ${s.titulo}: ${s.contenido.slice(0, 120)}`).join("\n")}`;

  try {
    const resp = await anthropic.messages.create({
      model: modeloPorTarea("SUGERIR_KB"),
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = (resp.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw) as { sugerencias: SugerenciaAuditorServicio[] };
    return json.sugerencias ?? [];
  } catch {
    return [];
  }
}
