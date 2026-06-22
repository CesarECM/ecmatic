// S33.3 — Generador de Brief de Diseño para assets faltantes.
// Trigger: auditoría de assets detecta que un servicio carece de imagen para un canal.

import { anthropic } from "./client";
import { modeloPorTarea } from "./model-router";

export type CanalImagen = "whatsapp" | "email" | "landing";

export interface BriefDiseno {
  dimensiones: string;
  formato: string;
  canal_uso: CanalImagen;
  uso_especifico: string;
  textos_requeridos: string[];
  concepto_creativo: string;
}

const SPECS_POR_CANAL: Record<CanalImagen, string> = {
  whatsapp: "1080x1080 px, cuadrada, JPG o PNG, máx 5 MB",
  email:    "600x300 px, horizontal, JPG o PNG, máx 2 MB",
  landing:  "1200x630 px, banner Open Graph, JPG o PNG, máx 2 MB",
};

export async function generarBriefDiseno(
  tituloServicio: string,
  contenidoServicio: string,
  canal: CanalImagen
): Promise<BriefDiseno> {
  const response = await anthropic.messages.create({
    model: modeloPorTarea("BRIEF_DISENO"),
    max_tokens: 500,
    system: `Eres el director creativo de ECMatic, CRM para certificaciones CONOCER en México.
Generas briefs de diseño precisos para assets digitales de marketing de servicios de certificación.
Responde SOLO en JSON con el formato exacto indicado, sin texto adicional.`,
    messages: [{
      role: "user",
      content: `Brief de diseño para canal "${canal}":
Servicio: ${tituloServicio}
Descripción: ${contenidoServicio.slice(0, 400)}
Specs técnicas: ${SPECS_POR_CANAL[canal]}

JSON requerido:
{
  "dimensiones": "dimensiones exactas y peso máximo",
  "formato": "JPG o PNG",
  "canal_uso": "${canal}",
  "uso_especifico": "dónde y cómo se usará esta imagen concretamente",
  "textos_requeridos": ["texto obligatorio 1", "texto opcional 2"],
  "concepto_creativo": "descripción visual concreta: composición, colores, iconografía, mensaje visual"
}`,
    }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  try {
    const parsed = JSON.parse(raw) as BriefDiseno;
    return { ...parsed, canal_uso: canal };
  } catch {
    return {
      dimensiones: SPECS_POR_CANAL[canal],
      formato: "JPG",
      canal_uso: canal,
      uso_especifico: `Imagen de ${canal} para el servicio ${tituloServicio}`,
      textos_requeridos: [tituloServicio, "Centro ECM — ceecm.mx"],
      concepto_creativo: `Diseño profesional que transmita confianza y certificación oficial para ${tituloServicio}`,
    };
  }
}
