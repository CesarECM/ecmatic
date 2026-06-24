"use server";

import { revalidatePath } from "next/cache";
import { marcarComisionPagada } from "@/services/comisiones";
import { registrarPago } from "@/services/pagos";
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

// S8.7 — Marca una comisión como pagada
export async function marcarComisionPagadaAction(id: string, metodoPago: string): Promise<void> {
  await marcarComisionPagada(id, metodoPago);
  void logSistema({ categoria: "ui", tipoAccion: "financiero.marcar-comision-pagada", fase: "ok", metadata: { comision_id: id, metodo_pago: metodoPago } });
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

  void logSistema({ categoria: "ui", tipoAccion: "financiero.registrar-pago-manual", fase: "ok", leadId, resultado: `$${monto}`, metadata: { monto, tiene_comprobante: !!comprobanteUrl } });
  revalidatePath("/admin/financiero");
}
