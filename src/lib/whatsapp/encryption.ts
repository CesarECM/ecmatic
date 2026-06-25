import crypto from "crypto";

// Encripta/desencripta tokens de WhatsApp para almacenamiento en DB.
//
// Formato GCM (actual):  <iv-hex>:<ciphertext-hex>:<authTag-hex>
// Formato CBC (legado):  <iv-hex>:<ciphertext-hex>
//
// GCM incluye un auth tag de 16 bytes que detecta cualquier manipulación
// del ciphertext en DB — CBC sin MAC permite voltear bits silenciosamente.
// decrypt() auto-detecta el formato por el número de partes para backward compat.
//
// Requiere env var ENCRYPTION_KEY = 64 chars hex (32 bytes aleatorios).
// Generar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const GCM_IV_LENGTH = 12; // NIST recomienda 12 bytes para GCM
const CBC_IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY no está configurada");
  return Buffer.from(key, "hex");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");

  if (parts.length === 3) {
    const [ivHex, ctHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== GCM_IV_LENGTH)
      throw new Error(`GCM IV inesperado: ${iv.length} bytes`);
    const authTag = Buffer.from(tagHex, "hex");
    if (authTag.length !== AUTH_TAG_LENGTH)
      throw new Error(`GCM auth tag inesperado: ${authTag.length} bytes`);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ctHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  if (parts.length === 2) {
    // CBC — solo descifrado, encrypt() nunca produce este formato
    const [ivHex, ctHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== CBC_IV_LENGTH)
      throw new Error(`CBC IV inesperado: ${iv.length} bytes`);
    const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
    let decrypted = decipher.update(ctHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  throw new Error(
    `Formato de token encriptado no reconocido (se esperaba 1 o 2 colones, hay ${parts.length - 1})`,
  );
}

// Detecta si un valor está en el formato CBC legado.
// Útil para migrar filas antiguas a GCM al primer uso.
export function isLegacyFormat(encryptedText: string): boolean {
  return encryptedText.split(":").length === 2;
}
