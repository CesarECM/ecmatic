// S18.1 — Clasificación de imágenes entrantes con Claude Vision
import { callClaudeIA } from "./client";

export type ClasificacionImagen = "comprobante" | "documento" | "otro";

export interface ResultadoVision {
  tipo: ClasificacionImagen;
  descripcion: string;
}

// MIME types que Claude acepta como imagen directa
const MIME_IMAGEN_SOPORTADOS = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// Para MIME types sin visión (PDF, docx, etc.) clasificamos por tipo sin llamar a la IA.
function clasificarPorMime(mimeType: string): ClasificacionImagen {
  if (mimeType === "application/pdf") return "documento";
  if (mimeType.startsWith("image/")) return "otro";
  return "documento";
}

// Clasifica una imagen usando Claude Vision.
// Si el MIME no es soportado por Vision, infiere la categoría por tipo.
export async function clasificarImagen(
  buffer: Buffer,
  mimeType: string
): Promise<ResultadoVision> {
  if (!MIME_IMAGEN_SOPORTADOS.has(mimeType)) {
    return {
      tipo: clasificarPorMime(mimeType),
      descripcion: `Archivo recibido (${mimeType})`,
    };
  }

  const base64 = buffer.toString("base64");

  const response = await callClaudeIA("VISION", {
    max_tokens: 20,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          },
          {
            type: "text",
            text: `Clasifica esta imagen en una de estas categorías:
- comprobante: recibo o comprobante de pago bancario/transferencia
- documento: identificación oficial, constancia, formulario, credencial
- otro: foto personal, meme, screenshot informal, imagen sin valor documental
Responde ÚNICAMENTE con una palabra: comprobante, documento, u otro.`,
          },
        ],
      },
    ],
  });

  const raw = (response.content[0] as { text: string }).text.trim().toLowerCase();
  const tipo: ClasificacionImagen =
    raw.startsWith("comprobante") ? "comprobante"
    : raw.startsWith("documento")  ? "documento"
    : "otro";

  return { tipo, descripcion: `Imagen clasificada como: ${tipo}` };
}
