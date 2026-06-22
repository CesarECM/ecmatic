"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarLlamada, type ObjetivoLlamada, type ResultadoLlamada } from "@/services/llamadas";
import { revalidatePath } from "next/cache";

export async function registrarLlamadaAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const svc = createServiceClient();
  const { data: vendedor } = await svc
    .from("vendedores").select("id").eq("profile_id", user.id).single();
  if (!vendedor) throw new Error("Vendedor no encontrado");

  await registrarLlamada({
    leadId:      formData.get("lead_id") as string,
    vendedorId:  vendedor.id,
    objetivo:    formData.get("objetivo") as ObjetivoLlamada,
    resultado:   formData.get("resultado") as ResultadoLlamada,
    notas:       (formData.get("notas") as string) || undefined,
    duracionMin: formData.get("duracion_min")
      ? Number(formData.get("duracion_min"))
      : undefined,
  });

  revalidatePath("/vendedor/llamadas");
}
