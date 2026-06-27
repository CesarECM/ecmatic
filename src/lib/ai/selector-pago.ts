// S24.1 — Selecciona el permalink de pago más adecuado para un servicio según fase CAGC.
// · fases 0-7  (exploración / evaluación)  → prefiere landing page
// · fases 8-16 (decisión / compra)         → prefiere pasarela directa
// Si el tipo preferido no existe, usa el único disponible.

import { listarPagosServicio } from "@/services/servicio-pagos";
import type { TipoPagoServicio } from "@/lib/supabase/types";

export interface PagoSeleccionado {
  url: string;
  tipo: TipoPagoServicio;
  nombre: string;
}

export async function seleccionarPagoServicio(
  recursoId: string,
  faseCagc?: number
): Promise<PagoSeleccionado | null> {
  const pagos = await listarPagosServicio(recursoId).catch(() => []);
  if (!pagos.length) return null;

  // Solo considera landing/pasarela (apartado se maneja por separado en estrategia-precio)
  const regulares = pagos.filter((p) => p.tipo !== "apartado");
  const tipoPrioridad: TipoPagoServicio = (faseCagc ?? 0) >= 8 ? "pasarela" : "landing";
  const seleccionado = regulares.find((p) => p.tipo === tipoPrioridad) ?? regulares[0] ?? pagos[0];

  return {
    url:    seleccionado.url,
    tipo:   seleccionado.tipo,
    nombre: seleccionado.nombre,
  };
}
