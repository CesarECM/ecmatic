import { createServiceClient } from "@/lib/supabase/service";

export type ModoOperacion = "pruebas" | "seguro" | "seguro_automatico" | "automatico";

export interface ConfigSistema {
  id: string;
  modo_operacion: ModoOperacion;
  umbral_confianza: number;
  updated_at: string;
  updated_by: string | null;
}

// S17.1 — Lee la configuración global del sistema (singleton)
export async function obtenerConfig(): Promise<ConfigSistema> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("configuracion_sistema")
    .select("*")
    .single();
  if (error) throw new Error(`[sistema] Error leyendo config: ${error.message}`);
  return data as ConfigSistema;
}

// S17.1 — Actualiza modo de operación (auditable por usuario)
export async function actualizarModo(
  modo: ModoOperacion,
  updatedBy?: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("configuracion_sistema")
    .update({ modo_operacion: modo, updated_by: updatedBy ?? null });
  if (error) throw new Error(`[sistema] Error actualizando modo: ${error.message}`);
}

// S17.1 — Actualiza umbral de confianza (0-1)
export async function actualizarUmbral(umbral: number): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await (supabase as any)
    .from("configuracion_sistema")
    .update({ umbral_confianza: Math.max(0, Math.min(1, umbral)) });
  if (error) throw new Error(`[sistema] Error actualizando umbral: ${error.message}`);
}

// S17.1 — Helper rápido: devuelve solo el modo activo (para uso en servicios internos)
export async function obtenerModo(): Promise<ModoOperacion> {
  const config = await obtenerConfig();
  return config.modo_operacion;
}
