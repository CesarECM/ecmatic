// Meta requiere solo dígitos: sin +, espacios ni guiones.
export function sanitizePhoneForMeta(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function normalizePhone(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

// Compara dos números tolerando diferencias de trunk prefix (ej. 0 nacional).
export function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1);
  const n2 = normalizePhone(phone2);
  if (n1 === n2) return true;
  if (n1.length >= 8 && n2.length >= 8) {
    return n1.slice(-8) === n2.slice(-8);
  }
  return false;
}

// E.164-like: 7-15 dígitos, no empieza en 0, con o sin +.
export function isValidE164(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone);
}

// Genera variantes del número para reintentos cuando el sandbox de Meta
// rechaza con error #131030 (número no en lista permitida). Algunos países
// registran el número con el 0 de trunk incluido o sin él.
export function phoneVariants(sanitized: string): string[] {
  if (!sanitized) return [];
  const seen = new Set<string>();
  const push = (v: string) => { if (v && !seen.has(v)) seen.add(v); };

  push(sanitized);

  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen) continue;
    const cc = sanitized.slice(0, ccLen);
    const rest = sanitized.slice(ccLen);
    if (!rest.startsWith("0")) push(cc + "0" + rest);
  }

  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen + 1) continue;
    const cc = sanitized.slice(0, ccLen);
    const rest = sanitized.slice(ccLen);
    if (rest.startsWith("0")) push(cc + rest.slice(1));
  }

  return [...seen];
}

export function isRecipientNotAllowedError(message: string): boolean {
  return /131030|not in allowed list|not in the allowed list/i.test(message);
}
