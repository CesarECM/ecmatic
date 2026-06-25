"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { logSistema } from "@/services/log-sistema";
import { marcarEmailLeido } from "@/services/bandeja-email";
import { enrollarLeadEnProtocolosActivos } from "@/services/lead-protocolo";
import { ejecutarProtocolosPendientes } from "@/services/ejecutor-protocolos";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function crearLeadRealAction(formData: FormData): Promise<void> {
  const traceId = crypto.randomUUID();

  void logSistema({ categoria: "ui", tipoAccion: "depuracion.crear-lead", fase: "inicio", traceId });

  const modo = await obtenerModo();
  if (modo !== "depuracion") {
    void logSistema({ categoria: "ui", tipoAccion: "depuracion.crear-lead", fase: "warn", traceId, resultado: "Sistema no está en modo depuración" });
    throw new Error("Solo disponible en modo Depuración");
  }

  const nombre   = (formData.get("nombre")   as string | null)?.trim() || null;
  const telefono = (formData.get("telefono") as string | null)?.trim();
  const email    = (formData.get("email")    as string | null)?.trim() || null;
  const canal    = (formData.get("canal")    as string | null) ?? "whatsapp";

  if (!telefono) throw new Error("El teléfono es requerido");

  const supabase = createServiceClient();

  // Reusar lead existente o crear uno nuevo
  const { data: existente } = await supabase
    .from("leads")
    .select("id, metadata")
    .eq("telefono", telefono)
    .maybeSingle();

  let leadId: string;

  if (existente) {
    await supabase.from("leads").update({
      ...(nombre && { nombre }),
      ...(email  && { email }),
      canal_origen: canal,
      metadata: { ...(existente.metadata as object ?? {}), ingresado_depuracion: true },
    }).eq("id", existente.id).throwOnError();
    leadId = existente.id;
  } else {
    const { data: nuevo, error } = await supabase.from("leads").insert({
      telefono,
      nombre,
      email,
      canal_origen: canal,
      metadata: { ingresado_depuracion: true, ingresado_at: new Date().toISOString() },
    }).select("id").single();
    if (error) {
      void logSistema({ categoria: "ui", tipoAccion: "depuracion.crear-lead", fase: "error", traceId, resultado: error.message, metadata: { telefono, canal } });
      throw new Error(`[depuracion] ${error.message}`);
    }
    leadId = nuevo.id;
  }

  if (canal === "no_show") {
    const enrollados = await enrollarLeadEnProtocolosActivos(leadId);
    void logSistema({
      categoria: "ui",
      tipoAccion: "depuracion.enroll-protocolo-noshow",
      fase: "ok",
      traceId,
      leadId,
      resultado: `${enrollados} protocolo(s) activado(s) por canal no-show`,
    });
    // Ejecutar toques pendientes de inmediato sin esperar al CRON horario
    const ejecucion = await ejecutarProtocolosPendientes();
    void logSistema({
      categoria: "ui",
      tipoAccion: "depuracion.ejecutar-protocolo-noshow",
      fase: "ok",
      traceId,
      leadId,
      resultado: JSON.stringify(ejecucion),
      metadata: ejecucion,
    });
  }

  void logSistema({
    categoria: "ui",
    tipoAccion: "depuracion.crear-lead",
    fase: "ok",
    traceId,
    leadId,
    resultado: existente ? "Lead existente actualizado" : "Lead nuevo creado",
    metadata: { canal, tiene_nombre: !!nombre, tiene_email: !!email, es_nuevo: !existente },
  });

  redirect(`/admin/leads/${leadId}`);
}

export async function marcarEmailLeidoAction(id: string): Promise<void> {
  await marcarEmailLeido(id);
  void logSistema({ categoria: "ui", tipoAccion: "depuracion.marcar-leido", fase: "ok", metadata: { email_id: id } });
  revalidatePath("/admin/depuracion");
  revalidatePath("/admin/leads");
}
