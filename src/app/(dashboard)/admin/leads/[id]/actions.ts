"use server";

import { revalidatePath } from "next/cache";
import { moverLead, asignarVendedor } from "@/services/pipeline";

export async function moverLeadDesdePerfilAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !nuevaEtapa) return;
  await moverLead(leadId, nuevaEtapa, "admin");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

export async function asignarVendedorAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const vendedorId = formData.get("vendedorId") as string;
  if (!leadId) return;
  await asignarVendedor(leadId, vendedorId || null);
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}
