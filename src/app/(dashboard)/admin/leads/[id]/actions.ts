"use server";

import { revalidatePath } from "next/cache";
import { moverLead, asignarVendedor } from "@/services/pipeline";
import { pausarNurturing, reanudarNurturing } from "@/services/nurturing";
import { createServiceClient } from "@/lib/supabase/service";
import { emitirFactura, construirItemServicio } from "@/lib/facturama/client";
import { marcarPrivacidadAceptada } from "@/services/privacidad";
import { agregarEntradaManualContexto } from "@/services/contexto";
import { headers } from "next/headers";
import { logSistema } from "@/services/log-sistema";

export async function moverLeadDesdePerfilAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nuevaEtapa = formData.get("nuevaEtapa") as string;
  if (!leadId || !nuevaEtapa) return;
  await moverLead(leadId, nuevaEtapa, "admin");
  void logSistema({ categoria: "ui", tipoAccion: "leads.mover", fase: "ok", leadId, resultado: nuevaEtapa });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

export async function asignarVendedorAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const vendedorId = formData.get("vendedorId") as string;
  if (!leadId) return;
  await asignarVendedor(leadId, vendedorId || null);
  void logSistema({ categoria: "ui", tipoAccion: "leads.asignar-vendedor", fase: "ok", leadId, metadata: { vendedor_id: vendedorId || null } });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");
}

// S12.5 — Guarda campos B2B en metadata del lead
export async function actualizarDatosB2BAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  if (!leadId) return;

  const db = createServiceClient();
  const { data: lead } = await db.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};

  const campos = ["empresa", "cargo", "tamano_empresa", "rfc"] as const;
  for (const campo of campos) {
    const val = (formData.get(campo) as string)?.trim();
    if (val) meta[campo] = val;
    else delete meta[campo];
  }

  await db.from("leads").update({ metadata: meta }).eq("id", leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.actualizar-b2b", fase: "ok", leadId });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S12.6 — Emite factura CFDI 4.0 vía Facturama sandbox
export async function emitirFacturaAction(
  formData: FormData
): Promise<{ ok: boolean; uuid?: string; error?: string }> {
  const leadId   = formData.get("leadId") as string;
  const monto    = Number(formData.get("monto"));
  const desc     = (formData.get("descripcion") as string)?.trim();
  const cpFiscal = (formData.get("cp_fiscal") as string)?.trim();

  if (!leadId || !monto || monto <= 0) return { ok: false, error: "Monto inválido" };

  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("nombre, metadata")
    .eq("id", leadId)
    .single();

  const meta = (lead?.metadata as Record<string, unknown>) ?? {};
  const rfc   = meta.rfc as string | undefined;
  const nombre = (lead?.nombre ?? "PUBLICO EN GENERAL") as string;

  if (!rfc) return { ok: false, error: "El lead no tiene RFC registrado" };

  const cfdiUse     = (meta.cfdi_uso as string)      ?? "G03";
  const regimen     = (meta.regimen_fiscal as string) ?? "616";
  const cp          = cpFiscal || (meta.cp_fiscal as string) || (process.env.FACTURAMA_CP_EMISOR ?? "00000");
  const cpEmisor    = process.env.FACTURAMA_CP_EMISOR ?? "00000";
  const descripcion = desc || "Servicio de certificación CONOCER";

  try {
    const resultado = await emitirFactura({
      Currency: "MXN",
      ExpeditionPlace: cpEmisor,
      PaymentForm: "03",
      PaymentMethod: "PUE",
      CfdiType: "I",
      Receiver: { Rfc: rfc, Name: nombre, CfdiUse: cfdiUse, FiscalRegime: regimen, TaxZipCode: cp },
      Items: [construirItemServicio(descripcion, monto)],
    });

    if (!resultado) return { ok: false, error: "Facturama no configurado (faltan credenciales)" };

    // Guarda el UUID en metadata para referencia
    await db
      .from("leads")
      .update({ metadata: { ...meta, cfdi_uuid: resultado.Uuid, cfdi_id: resultado.Id } })
      .eq("id", leadId);

    void logSistema({ categoria: "ui", tipoAccion: "leads.emitir-factura", fase: "ok", leadId, resultado: resultado.Uuid, metadata: { cfdi_id: resultado.Id, monto } });
    revalidatePath(`/admin/leads/${leadId}`);
    return { ok: true, uuid: resultado.Uuid };
  } catch (err) {
    void logSistema({ categoria: "ui", tipoAccion: "leads.emitir-factura", fase: "error", leadId, resultado: String(err), metadata: { monto } });
    return { ok: false, error: String(err) };
  }
}

// S12.9 — Registra aceptación manual de privacidad (consentimiento por teléfono/presencial)
export async function marcarPrivacidadManualAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  if (!leadId) return;
  await marcarPrivacidadAceptada(leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.marcar-privacidad", fase: "ok", leadId });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S23.2 — Agrega una nota manual al Contexto del lead
export async function agregarEntradaManualAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const nota = (formData.get("nota") as string)?.trim();
  if (!leadId || !nota) return;
  const hdrs = await headers();
  const autor = hdrs.get("x-user-email") ?? "admin";
  await agregarEntradaManualContexto(leadId, nota, autor);
  void logSistema({ categoria: "ui", tipoAccion: "leads.agregar-nota", fase: "ok", leadId, metadata: { autor } });
  revalidatePath(`/admin/leads/${leadId}`);
}

// S4.6 — Pausa o reanuda nurturing desde el perfil del lead
export async function toggleNurturingAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  const pausado = formData.get("pausado") === "true";
  if (!leadId) return;
  if (pausado) await reanudarNurturing(leadId);
  else await pausarNurturing(leadId);
  void logSistema({ categoria: "ui", tipoAccion: "leads.toggle-nurturing", fase: "ok", leadId, metadata: { accion: pausado ? "reanudar" : "pausar" } });
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/nurturing");
}
