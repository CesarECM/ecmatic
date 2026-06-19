"use server";

import { revalidatePath } from "next/cache";
import { moverLead, asignarVendedor } from "@/services/pipeline";
import { pausarNurturing, reanudarNurturing } from "@/services/nurturing";

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

// S4.6 — Pausa o reanuda nurturing desde el perfil del lead
export async function toggleNurturingAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const pausado = formData.get("pausado") === "true";
  if (!leadId) return;
  if (pausado) await reanudarNurturing(leadId);
  else await pausarNurturing(leadId);
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/nurturing");
}
