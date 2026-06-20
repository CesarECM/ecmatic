// S18.3 — Identidad de marca (singleton)
import { createServiceClient } from "@/lib/supabase/service";

export interface IdentidadMarca {
  id: string;
  nombre_empresa: string;
  slogan: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  color_primario: string;
  color_secundario: string;
  color_acento: string;
  color_texto: string;
  color_fondo: string;
  fuente_principal: string;
  fuente_secundaria: string | null;
  firma_whatsapp: string | null;
  firma_email: string | null;
  updated_at: string;
}

export type CamposIdentidad = Partial<Omit<IdentidadMarca, "id" | "updated_at">>;

// Lee la identidad de marca (singleton — siempre hay exactamente una fila).
export async function obtenerIdentidad(): Promise<IdentidadMarca> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("identidad_marca")
    .select("*")
    .single();
  if (error) throw new Error(`[identidad-marca] Error leyendo: ${error.message}`);
  return data as IdentidadMarca;
}

// Actualiza los campos de identidad indicados.
export async function actualizarIdentidad(
  campos: CamposIdentidad,
  updatedBy?: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("identidad_marca")
    .update({ ...campos, updated_by: updatedBy ?? null });
  if (error) throw new Error(`[identidad-marca] Error actualizando: ${error.message}`);
}

// Devuelve la identidad formateada como bloque de texto para inyectar en prompts IA (S18.4).
export function formatearIdentidadParaPrompt(id: IdentidadMarca): string {
  const lineas = [
    `Empresa: ${id.nombre_empresa}`,
    id.slogan ? `Slogan: ${id.slogan}` : null,
    `Colores: primario ${id.color_primario}, secundario ${id.color_secundario}, acento ${id.color_acento}`,
    `Tipografía: ${id.fuente_principal}${id.fuente_secundaria ? ` / ${id.fuente_secundaria}` : ""}`,
    id.firma_whatsapp ? `Firma WhatsApp: "${id.firma_whatsapp}"` : null,
    id.firma_email    ? `Firma email: "${id.firma_email}"` : null,
  ].filter(Boolean);
  return lineas.join("\n");
}
