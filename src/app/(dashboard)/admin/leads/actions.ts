"use server";

import { revalidatePath } from "next/cache";
import { moverLead } from "@/services/pipeline";
import { logSistema } from "@/services/log-sistema";

export async function moverLeadAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !nuevaEtapa) return;
  await moverLead(leadId, nuevaEtapa, "admin");
  void logSistema({ categoria: "ui", tipoAccion: "leads.mover", fase: "ok", leadId, resultado: nuevaEtapa });
  revalidatePath("/admin/leads");
}
