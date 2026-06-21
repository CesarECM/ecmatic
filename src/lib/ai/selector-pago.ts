// S24.1 — Selecciona el permalink de pago más adecuado para un servicio según fase CAGC.
// · fases 0-7  (exploración / evaluación)  → prefiere landing page
// · fases 8-16 (decisión / compra)         → prefiere pasarela directa
// Si el tipo preferido no existe, usa el único disponible.

import { listarPagosServicio } from "@/services/servicio-pagos";
import type { TipoPagoServicio } from "@/lib/supabase/types";

export interface PagoSeleccionado {
  url: string;
  tipo: TipoPagoServicio;
  descripcion: string | null;
}

export async function seleccionarPagoServicio(
  recursoId: string,
  faseCagc?: number
): Promise<PagoSeleccionado | null> {
  const pagos = await listarPagosServicio(recursoId).catch(() => []);
  if (!pagos.length) return null;

  const tipoPrioridad: TipoPagoServicio = (faseCagc ?? 0) >= 8 ? "pasarela" : "landing";
  const seleccionado = pagos.find((p) => p.tipo === tipoPrioridad) ?? pagos[0];

  return {
    url:         seleccionado.url,
    tipo:        seleccionado.tipo,
    descripcion: seleccionado.descripcion,
  };
}
