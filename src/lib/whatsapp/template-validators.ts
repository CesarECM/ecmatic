// Validadores puros para templates de WhatsApp — se ejecutan ANTES de enviar
// a Meta para obtener errores específicos por campo, no el genérico 400 de Meta.
// Todos los límites siguen la Cloud API v21.0:
// https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

import type { ComponenteTemplate, NuevoTemplate } from "@/services/wa-templates";

const LIMITS = {
  bodyMaxLength: 1024,
  footerMaxLength: 60,
  headerTextMaxLength: 60,
  buttonTextMaxLength: 25,
  maxButtonsTotal: 10,
  maxUrlButtons: 2,
  maxPhoneButtons: 1,
  nameRegex: /^[a-z0-9_]{1,512}$/,
} as const;

// Extrae índices {{N}} ordenados y únicos de un texto.
export function extractVariableIndices(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function assertContiguous(indices: number[], where: string): void {
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      throw new Error(
        `Las variables de ${where} deben ser contiguas desde {{1}} — se encontró: ${indices.map((n) => `{{${n}}}`).join(", ")}.`,
      );
    }
  }
}

function validateNombre(nombre: string): void {
  if (!nombre?.trim()) throw new Error("El nombre del template es obligatorio.");
  const normalizado = nombre.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!LIMITS.nameRegex.test(normalizado)) {
    throw new Error("El nombre solo puede tener letras minúsculas, dígitos y guion bajo (1-512 chars).");
  }
}

function validateHeader(comp: ComponenteTemplate): void {
  if (comp.format !== "TEXT") return; // IMAGE/VIDEO/DOCUMENT se validan en Meta
  const text = comp.text ?? "";
  if (!text.trim()) throw new Error("El header de tipo TEXT requiere texto.");
  if (text.length > LIMITS.headerTextMaxLength) {
    throw new Error(`El header supera ${LIMITS.headerTextMaxLength} caracteres (${text.length}).`);
  }
  const indices = extractVariableIndices(text);
  if (indices.length > 1) throw new Error("El header TEXT soporta máximo una variable (regla Meta).");
  if (indices.length === 1 && indices[0] !== 1) throw new Error("La variable del header debe ser {{1}} (regla Meta).");
}

function validateBody(comp: ComponenteTemplate): void {
  const text = comp.text ?? "";
  if (!text.trim()) throw new Error("El cuerpo del template es obligatorio.");
  if (text.length > LIMITS.bodyMaxLength) {
    throw new Error(`El cuerpo supera ${LIMITS.bodyMaxLength} caracteres (${text.length}).`);
  }
  const indices = extractVariableIndices(text);
  assertContiguous(indices, "el cuerpo");
}

function validateFooter(comp: ComponenteTemplate): void {
  const text = comp.text ?? "";
  if (text.length > LIMITS.footerMaxLength) {
    throw new Error(`El footer supera ${LIMITS.footerMaxLength} caracteres (${text.length}).`);
  }
  if (extractVariableIndices(text).length > 0) {
    throw new Error("El footer no puede contener variables {{N}} (regla Meta).");
  }
}

function validateButtons(comp: ComponenteTemplate): void {
  const buttons = comp.buttons ?? [];
  if (buttons.length === 0) return;
  if (buttons.length > LIMITS.maxButtonsTotal) {
    throw new Error(`Máximo ${LIMITS.maxButtonsTotal} botones permitidos (${buttons.length} enviados).`);
  }

  const counts = { URL: 0, PHONE_NUMBER: 0, QUICK_REPLY: 0 };
  for (const b of buttons) {
    const t = b.type.toUpperCase() as keyof typeof counts;
    if (t in counts) counts[t]++;
  }

  if (counts.URL > LIMITS.maxUrlButtons) {
    throw new Error(`Máximo ${LIMITS.maxUrlButtons} botones URL (${counts.URL} enviados).`);
  }
  if (counts.PHONE_NUMBER > LIMITS.maxPhoneButtons) {
    throw new Error(`Máximo ${LIMITS.maxPhoneButtons} botón PHONE_NUMBER (${counts.PHONE_NUMBER} enviados).`);
  }

  // QUICK_REPLY no puede intercalarse con botones CTA
  let sawNonQR = false;
  for (const b of buttons) {
    if (b.type.toUpperCase() === "QUICK_REPLY") {
      if (sawNonQR) throw new Error("Los botones QUICK_REPLY deben ir agrupados antes de los botones URL/PHONE_NUMBER.");
    } else {
      sawNonQR = true;
    }
  }

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b.text?.trim()) throw new Error(`El botón #${i + 1} (${b.type}) no tiene texto.`);
    if (b.text.length > LIMITS.buttonTextMaxLength) {
      throw new Error(`El texto del botón #${i + 1} supera ${LIMITS.buttonTextMaxLength} caracteres.`);
    }
    if (b.type.toUpperCase() === "URL" && !b.url?.trim()) {
      throw new Error(`El botón URL #${i + 1} requiere una URL.`);
    }
    if (b.type.toUpperCase() === "PHONE_NUMBER" && !b.phone_number?.trim()) {
      throw new Error(`El botón PHONE_NUMBER #${i + 1} requiere un número de teléfono.`);
    }
  }
}

// Valida todo el template. Lanza en el primer error con mensaje específico por campo.
export function validateTemplate(datos: NuevoTemplate): void {
  validateNombre(datos.nombre);
  if (!datos.idioma?.trim()) throw new Error("El idioma es obligatorio.");
  if (!Array.isArray(datos.componentes) || datos.componentes.length === 0) {
    throw new Error("Se requiere al menos un componente (BODY).");
  }

  const hasBody = datos.componentes.some((c) => c.type === "BODY");
  if (!hasBody) throw new Error("El template debe tener un componente BODY.");

  for (const comp of datos.componentes) {
    switch (comp.type) {
      case "HEADER":  validateHeader(comp);  break;
      case "BODY":    validateBody(comp);    break;
      case "FOOTER":  validateFooter(comp);  break;
      case "BUTTONS": validateButtons(comp); break;
    }
  }
}
