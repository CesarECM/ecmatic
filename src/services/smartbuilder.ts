import { createServiceClient } from "@/lib/supabase/service";
import { crearCandidato, obtenerProgreso } from "@/lib/smartbuilder/client";
import { sendTextMessage } from "@/lib/whatsapp/client";

const DIAS_INACTIVIDAD_ALERTA = Number(process.env.SBC_DIAS_INACTIVIDAD ?? "7");

// S9.1 — Crea el acceso en SmartBuilderEC tras confirmarse el pago
export async function altaAccesoSmartBuilder(leadId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("nombre, email, telefono, pipeline_ruta")
    .eq("id", leadId)
    .single();

  if (!lead?.email) {
    // Sin email no se puede crear acceso — guardar pendiente
    await supabase.from("smartbuilder_accesos").upsert(
      { lead_id: leadId, estado: "pendiente" },
      { onConflict: "lead_id" }
    );
    return;
  }

  const estandares = lead.pipeline_ruta === "premium"
    ? ["EC0217", "EC0458", "EC0539"]
    : ["EC0217"];

  const resultado = await crearCandidato({
    nombre: lead.nombre ?? "Candidato",
    email: lead.email,
    telefono: lead.telefono ?? undefined,
    estandares,
  });

  await supabase.from("smartbuilder_accesos").upsert({
    lead_id: leadId,
    candidato_id: resultado?.candidato_id ?? null,
    estandares,
    estado: resultado ? "activo" : "pendiente",
    alta_confirmada: !!resultado,
  }, { onConflict: "lead_id" });
}

// S9.2 — Polling diario: actualiza progreso de todos los candidatos activos
export async function sincronizarProgreso(): Promise<{ actualizados: number; errores: number }> {
  const supabase = createServiceClient();
  const { data: accesos } = await supabase
    .from("smartbuilder_accesos")
    .select("lead_id, candidato_id, ultimo_avance")
    .eq("estado", "activo")
    .eq("alta_confirmada", true)
    .not("candidato_id", "is", null);

  let actualizados = 0;
  let errores = 0;

  for (const acceso of accesos ?? []) {
    if (!acceso.candidato_id) continue;
    try {
      const progreso = await obtenerProgreso(acceso.candidato_id);
      if (!progreso) continue;

      // Upsert progreso del día (UNIQUE lead_id + fecha)
      await supabase.from("smartbuilder_progreso").upsert({
        lead_id: acceso.lead_id,
        porcentaje: progreso.porcentaje,
        datos_raw: progreso.datos as Record<string, unknown>,
        fecha: new Date().toISOString().split("T")[0],
      }, { onConflict: "lead_id,fecha" });

      // Si llegó al 100%, marcar como completado
      if (progreso.porcentaje >= 100) {
        await supabase.from("smartbuilder_accesos")
          .update({ estado: "completado", ultimo_avance: 100 })
          .eq("lead_id", acceso.lead_id);
      } else {
        await supabase.from("smartbuilder_accesos")
          .update({ ultimo_avance: progreso.porcentaje })
          .eq("lead_id", acceso.lead_id);
      }
      actualizados++;
    } catch {
      errores++;
    }
  }

  return { actualizados, errores };
}

// S9.3 — Detecta candidatos inactivos y envía mensaje de reactivación
export async function detectarInactividad(): Promise<{ reactivados: number }> {
  const supabase = createServiceClient();
  const limite = new Date(Date.now() - DIAS_INACTIVIDAD_ALERTA * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const { data: accesos } = await supabase
    .from("smartbuilder_accesos")
    .select("lead_id, ultimo_avance, alerta_enviada")
    .eq("estado", "activo")
    .eq("alerta_enviada", false);

  let reactivados = 0;

  for (const acc of accesos ?? []) {
    const { data: ultimoProg } = await supabase
      .from("smartbuilder_progreso")
      .select("fecha")
      .eq("lead_id", acc.lead_id)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimoProg && ultimoProg.fecha > limite) continue;

    const { data: lead } = await supabase
      .from("leads").select("nombre, telefono").eq("id", acc.lead_id).single();
    if (!lead?.telefono) continue;

    const msg = `Hola${lead.nombre ? ` ${lead.nombre}` : ""} 👋 Notamos que llevas algunos días sin avanzar en tu proceso de certificación. ¿Tienes alguna duda o necesitas apoyo? Estamos aquí para ayudarte a certificarte con éxito 🎓`;
    try {
      await sendTextMessage(lead.telefono, msg);
      await supabase.from("smartbuilder_accesos")
        .update({ alerta_enviada: true }).eq("lead_id", acc.lead_id);
      reactivados++;
    } catch { /* no bloquear */ }
  }

  return { reactivados };
}
