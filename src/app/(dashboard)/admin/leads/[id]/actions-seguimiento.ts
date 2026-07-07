"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { safeAction } from "@/lib/safe-action";
import { logSistema } from "@/services/log-sistema";
import {
  obtenerActivo,
  posponerSeguimientoFlexible,
  cancelarSeguimientoActivo,
} from "@/services/seguimiento-lead";
import { archivarLead } from "@/services/limpieza-leads";
import { agregarABlacklist } from "@/services/limpieza-leads";
import {
  resolverItemAprobacion,
  actualizarStatsAprobacion,
} from "@/services/ghl-aprobacion";

export type ModoPosponer = "horas" | "dias" | "fecha" | "inactivos" | "negra";

// Rechaza el GHL item pendiente asociado a un seguimiento, sin afectar stats de confianza
// (es una decisión operativa, no editorial).
async function rechazarItemPendiente(seguimientoId: string, campana: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: item } = await (supabase as any)
    .from("ghl_approval_queue")
    .select("id")
    .eq("seguimiento_id", seguimientoId)
    .eq("estado", "pendiente")
    .maybeSingle() as { data: { id: string } | null };

  if (!item) return;
  await resolverItemAprobacion({ id: item.id, estado: "rechazado" });
  await actualizarStatsAprobacion(campana, "rechazado");
}

// Resuelve el próximo timestamp según el modo.
function resolverProximoAt(modo: ModoPosponer, valor?: string): Date | null {
  if (modo === "horas" && valor) return new Date(Date.now() + Number(valor) * 3_600_000);
  if (modo === "dias"  && valor) return new Date(Date.now() + Number(valor) * 86_400_000);
  if (modo === "fecha" && valor) return new Date(valor);
  return null;
}

// Pospone, archiva o añade a lista negra el seguimiento activo de un lead.
// Para inactivos/negra: cancela el ciclo completo. Para los demás: solo retrasa proximo_at.
export const posponerSeguimientoAction = safeAction(async (
  leadId: string,
  modo: ModoPosponer,
  valor?: string,
): Promise<void> => {
  const CAMPANA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
  const seg = await obtenerActivo(leadId);

  if (modo === "inactivos") {
    if (seg) {
      await rechazarItemPendiente(seg.id, CAMPANA);
      await cancelarSeguimientoActivo(leadId);
    }
    await archivarLead(leadId, "Marcado como inactivo desde panel");
    void logSistema({
      categoria: "ui", tipoAccion: "seguimiento.posponer.inactivos", fase: "ok",
      leadId, resultado: "lead archivado + seguimiento cancelado",
    });
    revalidatePath(`/admin/leads/${leadId}`);
    return;
  }

  if (modo === "negra") {
    const supabase = createServiceClient();
    const { data: lead } = await (supabase as any)
      .from("leads").select("telefono, email").eq("id", leadId).maybeSingle() as
      { data: { telefono: string | null; email: string | null } | null };

    if (seg) {
      await rechazarItemPendiente(seg.id, CAMPANA);
      await cancelarSeguimientoActivo(leadId);
    }
    await agregarABlacklist(
      { telefono: lead?.telefono ?? undefined, email: lead?.email ?? undefined },
      "solicitud_eliminacion",
    );
    await archivarLead(leadId, "Añadido a lista negra desde panel");
    void logSistema({
      categoria: "ui", tipoAccion: "seguimiento.posponer.negra", fase: "ok",
      leadId, resultado: "lead en blacklist + seguimiento cancelado",
    });
    revalidatePath(`/admin/leads/${leadId}`);
    return;
  }

  // Modo horas / dias / fecha
  if (!seg) throw new Error("Sin seguimiento activo para este lead");
  const proximoAt = resolverProximoAt(modo, valor);
  if (!proximoAt || isNaN(proximoAt.getTime())) throw new Error("Fecha inválida");

  await posponerSeguimientoFlexible(seg.id, proximoAt);
  await rechazarItemPendiente(seg.id, CAMPANA);

  void logSistema({
    categoria: "ui", tipoAccion: "seguimiento.posponer", fase: "ok",
    leadId, resultado: `modo:${modo} proximo:${proximoAt.toISOString()}`,
    metadata: { seguimiento_id: seg.id, modo, valor },
  });

  revalidatePath(`/admin/leads/${leadId}`);
});
