import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Devuelve el teléfono real del lead, o null si es un placeholder interno de GHL.
// Los leads de GHL se crean con "ghl_<contactId>" cuando no se capturó el número real.
export function telVisible(telefono: string | null | undefined): string | null {
  if (!telefono || telefono.startsWith("ghl_") || telefono.startsWith("sandbox_")) return null;
  return telefono;
}
