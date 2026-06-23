// S24.1 — CRUD de links de pago por servicio.
// Cada servicio puede tener múltiples permalinks (landing, pasarela).
// La IA elige cuál compartir según fase CAGC del lead.

import { createServiceClient } from "@/lib/supabase/service";
import type { TipoPagoServicio } from "@/lib/supabase/types";

export interface ServicioPago {
  id: string;
  servicio_id: string;
  tipo: TipoPagoServicio;
  url: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrearServicioPagoInput {
  servicio_id: string;
  tipo: TipoPagoServicio;
  url: string;
  descripcion?: string | null;
  activo?: boolean;
}

export async function listarPagosServicio(servicioId: string): Promise<ServicioPago[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("servicio_pagos")
    .select("*")
    .eq("servicio_id", servicioId)
    .eq("activo", true)
    .order("tipo");
  if (error) throw new Error(`[servicio-pagos] Error listando: ${error.message}`);
  return (data ?? []) as ServicioPago[];
}

export async function crearServicioPago(input: CrearServicioPagoInput): Promise<ServicioPago> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("servicio_pagos")
    .insert({
      servicio_id: input.servicio_id,
      tipo:        input.tipo,
      url:         input.url,
      descripcion: input.descripcion ?? null,
      activo:      input.activo ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`[servicio-pagos] Error creando: ${error.message}`);
  return data as ServicioPago;
}

export async function actualizarServicioPago(
  id: string,
  campos: Partial<Omit<ServicioPago, "id" | "created_at" | "updated_at">>
): Promise<ServicioPago> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("servicio_pagos")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[servicio-pagos] Error actualizando: ${error.message}`);
  return data as ServicioPago;
}

export async function eliminarServicioPago(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("servicio_pagos").delete().eq("id", id);
  if (error) throw new Error(`[servicio-pagos] Error eliminando: ${error.message}`);
}
