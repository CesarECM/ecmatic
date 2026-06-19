"use server";

import { revalidatePath } from "next/cache";
import { marcarComisionPagada } from "@/services/comisiones";
import { registrarPago } from "@/services/pagos";
import { createServiceClient } from "@/lib/supabase/service";

// S8.7 — Marca una comisión como pagada
export async function marcarComisionPagadaAction(id: string, metodoPago: string): Promise<void> {
  await marcarComisionPagada(id, metodoPago);
  revalidatePath("/admin/financiero");
}

// S8.3 — Registra un pago manual
export async function registrarPagoManualAction(formData: FormData): Promise<void> {
  const leadId = formData.get("lead_id") as string;
  const monto = Number(formData.get("monto"));
  const comprobanteUrl = (formData.get("comprobante_url") as string) || undefined;
  const notas = (formData.get("notas") as string) || undefined;

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads").select("vendedor_id").eq("id", leadId).single();

  await registrarPago({
    leadId,
    vendedorId: lead?.vendedor_id ?? null,
    monto,
    metodo: "manual",
    comprobanteUrl,
    notas,
  });

  revalidatePath("/admin/financiero");
}
