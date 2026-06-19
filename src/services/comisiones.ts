import { createServiceClient } from "@/lib/supabase/service";

const PORCENTAJE_COMISION = 10;

// S8.5 — Calcula y registra una comisión del 10% por un pago
export async function calcularComision(
  pagoId: string,
  vendedorId: string,
  montoPago: number
): Promise<void> {
  const supabase = createServiceClient();
  const montoComision = Number((montoPago * PORCENTAJE_COMISION / 100).toFixed(2));

  await supabase.from("comisiones").insert({
    pago_id: pagoId,
    vendedor_id: vendedorId,
    monto_comision: montoComision,
    porcentaje: PORCENTAJE_COMISION,
  });
}

// S8.7 — Lista comisiones con totales. Si se pasa vendedorId, filtra solo sus comisiones.
export async function listarComisiones(vendedorId?: string) {
  const supabase = createServiceClient();
  let q = supabase
    .from("comisiones")
    .select("*, vendedores(nombre), pagos(monto, metodo, created_at, leads(nombre))")
    .order("created_at", { ascending: false });

  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data, error } = await q;
  if (error) throw new Error(`[comisiones] ${error.message}`);
  return data ?? [];
}

// S8.7 — Totales por vendedor para el panel financiero
export async function resumenComisiones() {
  const supabase = createServiceClient();
  const { data: vendedores } = await supabase
    .from("vendedores").select("id, nombre").eq("activo", true);

  const resumen = [];
  for (const v of vendedores ?? []) {
    const { data } = await supabase
      .from("comisiones")
      .select("monto_comision, estado")
      .eq("vendedor_id", v.id);

    const pendiente = (data ?? []).filter((c) => c.estado === "pendiente")
      .reduce((s, c) => s + Number(c.monto_comision), 0);
    const pagada = (data ?? []).filter((c) => c.estado === "pagada")
      .reduce((s, c) => s + Number(c.monto_comision), 0);

    resumen.push({ vendedorId: v.id, nombre: v.nombre, pendiente, pagada });
  }
  return resumen;
}

// S8.7 — Marca una comisión como pagada
export async function marcarComisionPagada(
  id: string,
  metodoPago: string
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("comisiones").update({
    estado: "pagada",
    fecha_pago: new Date().toISOString(),
    metodo_pago: metodoPago,
  }).eq("id", id);
}
