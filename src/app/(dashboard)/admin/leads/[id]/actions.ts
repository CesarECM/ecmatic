"use server";

import { revalidatePath } from "next/cache";
import { moverLead } from "@/services/pipeline";

export async function moverLeadDesdePerfilAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !nuevaEtapa) return;
  await moverLead(leadId, nuevaEtapa, "admin");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}
