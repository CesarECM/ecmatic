import { createHash } from "crypto";

// Concatena campos no nulos en un solo string para embedear.
// Filtra nulos, undefined y strings vacíos antes de unir.
export function buildEmbeddingText(fields: (string | null | undefined)[]): string {
  return fields
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .join(" ");
}

// SHA-256 del texto — permite saltarse el embedding si el contenido no cambió.
export function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Formatea number[] como literal pgvector: [0.1,0.2,...]
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
