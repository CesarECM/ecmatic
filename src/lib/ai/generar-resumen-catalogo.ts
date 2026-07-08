// MPS-32 S115.2 — Comprime el catálogo completo de servicios en un texto ultra-corto para el prompt.
// Haiku lee todos los servicios activos y produce una línea por servicio, sin ambigüedad.

import { callClaudeIA } from "./client";

export interface ServicioCatalogo {
  titulo: string;
  estandar_conocer: string | null;
  nivel_estandar: number | null;
  modalidad: string | null;
  precio_centavos: number | null;
  duracion_horas: number | null;
  para_quien_es: string | null;
}

function serializarServicio(s: ServicioCatalogo, idx: number): string {
  const partes = [`${idx + 1}. Título: ${s.titulo}`];
  if (s.estandar_conocer) {
    partes.push(`   Estándar CONOCER: ${s.estandar_conocer}${s.nivel_estandar != null ? ` N${s.nivel_estandar}` : ""}`);
  }
  if (s.modalidad) partes.push(`   Modalidad: ${s.modalidad.replace("_", " ")}`);
  if (s.precio_centavos != null) {
    partes.push(`   Precio: $${(s.precio_centavos / 100).toLocaleString("es-MX")} MXN`);
  }
  if (s.duracion_horas) partes.push(`   Duración: ${s.duracion_horas}h`);
  if (s.para_quien_es)  partes.push(`   Para quién: ${s.para_quien_es}`);
  return partes.join("\n");
}

const SYSTEM_PROMPT = `Eres un compresor semántico. Tu única tarea es convertir una lista de servicios en un catálogo ultra-comprimido para inyectarlo en prompts de IA.

FORMATO DE SALIDA (exacto, sin variaciones):
CATÁLOGO ({n} servicios activos):
• {Título exacto} [{código} N{nivel}] ({modalidad}, ${"{precio}"} MXN, {horas}h): {para quién en ≤12 palabras}

REGLAS ESTRICTAS:
1. Una sola línea por servicio comenzando con "•".
2. Omite cualquier campo que no exista — sin "N/A", sin paréntesis vacíos.
3. "Para quién": ocupación principal + requisito clave, máximo 12 palabras, sin adjetivos.
4. Precio: solo el número formateado con coma de miles + "MXN". Si no hay precio, omite el campo.
5. Sin lenguaje de marketing, sin descripciones largas, sin explicaciones adicionales.
6. Responde SOLO con el catálogo — nada más.`;

export async function generarResumenCatalogo(
  servicios: ServicioCatalogo[],
): Promise<string> {
  if (!servicios.length) return "CATÁLOGO (0 servicios activos):";

  const n = servicios.length;
  const lista = servicios.map(serializarServicio).join("\n\n");

  const response = await callClaudeIA("RESUMEN_CATALOGO", {
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Genera el catálogo comprimido para estos ${n} servicios activos:\n\n${lista}`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text.trim();
}
