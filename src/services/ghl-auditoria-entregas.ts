import { createServiceClient } from "@/lib/supabase/service";
import { buscarConversacionWA, obtenerMensajes } from "@/lib/ghl/conversations-api";
import { logSistema } from "@/services/log-sistema";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

// Ventana máxima para buscar el mensaje outbound post-inscripción (ms)
const VENTANA_MENSAJE_MS = 2 * 60 * 60 * 1000; // 2 horas

export type AccionAuditoria = "entregado" | "fallido" | "sin_mensaje" | "revisar";

export interface AuditoriaItem {
  ghl_contact_id: string;
  nombre:         string;
  enviado_at:     string;
  variante:       "a" | "b" | null;
  workflow_id:    string | null;
  status_ghl:     string | null;
  cuerpo_mensaje: string | null;
  accion:         AccionAuditoria;
}

export interface AuditoriaBatchResult {
  items:    AuditoriaItem[];
  total:    number;
  page:     number;
  pageSize: number;
}

// Clasificar status GHL → acción
function clasificarStatus(status: string | null | undefined, tieneMensaje: boolean): AccionAuditoria {
  if (!tieneMensaje) return "sin_mensaje";
  if (!status) return "revisar";
  const s = status.toLowerCase();
  if (s === "delivered" || s === "read") return "entregado";
  if (s === "failed"    || s === "undelivered" || s === "error") return "fallido";
  // "sent" = llegó a servidores WA pero sin confirmación de device → revisar
  return "revisar";
}

export async function auditarEntregasBatch(
  since:    string,
  page:     number,
  pageSize: number,
): Promise<AuditoriaBatchResult> {
  const supabase = createServiceClient() as any;
  const offset   = (page - 1) * pageSize;

  // Candidatos: enviados, sin respuesta, en la ventana de tiempo
  const { data: candidatos, count } = await supabase
    .from("ghl_campana_logs")
    .select("ghl_contact_id, nombre, enviado_at, variante, workflow_id", { count: "exact" })
    .eq("campana", CAMPANA_ACTIVA)
    .eq("enviado", true)
    .is("respuesta_tipo", null)
    .gte("enviado_at", since)
    .order("enviado_at", { ascending: true })
    .range(offset, offset + pageSize - 1) as {
      data: { ghl_contact_id: string; nombre: string | null; enviado_at: string; variante: string | null; workflow_id: string | null }[] | null;
      count: number | null;
    };

  if (!candidatos?.length) {
    return { items: [], total: count ?? 0, page, pageSize };
  }

  const items: AuditoriaItem[] = [];

  for (const c of candidatos) {
    try {
      const enviadoTs  = new Date(c.enviado_at).getTime();
      const limiteTs   = enviadoTs + VENTANA_MENSAJE_MS;
      let statusGhl: string | null = null;
      let cuerpo:    string | null = null;
      let encontrado = false;

      const conv = await buscarConversacionWA(c.ghl_contact_id);
      if (conv) {
        const mensajes = await obtenerMensajes(conv.id, 15);
        // Buscar el primer mensaje outbound dentro de la ventana post-inscripción
        const match = mensajes
          .filter((m) => {
            const t = new Date(m.dateAdded).getTime();
            return m.direction === "outbound" && t >= enviadoTs && t <= limiteTs;
          })
          .sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime())[0];

        if (match) {
          encontrado = true;
          statusGhl  = match.status ?? null;
          cuerpo     = (match.body ?? match.text ?? "").slice(0, 120) || null;
        }
      }

      items.push({
        ghl_contact_id: c.ghl_contact_id,
        nombre:         c.nombre ?? "Sin nombre",
        enviado_at:     c.enviado_at,
        variante:       (c.variante as "a" | "b") ?? null,
        workflow_id:    c.workflow_id,
        status_ghl:     statusGhl,
        cuerpo_mensaje: cuerpo,
        accion:         clasificarStatus(statusGhl, encontrado),
      });
    } catch (err) {
      // Error por contacto no rompe el batch — lo marcamos como revisar
      items.push({
        ghl_contact_id: c.ghl_contact_id,
        nombre:         c.nombre ?? "Sin nombre",
        enviado_at:     c.enviado_at,
        variante:       (c.variante as "a" | "b") ?? null,
        workflow_id:    c.workflow_id,
        status_ghl:     null,
        cuerpo_mensaje: null,
        accion:         "revisar",
      });
      void logSistema({
        categoria:  "servicio",
        tipoAccion: "ghl_auditoria.error_contacto",
        fase:       "error",
        resultado:  err instanceof Error ? err.message.slice(0, 200) : "Error",
        metadata:   { ghl_contact_id: c.ghl_contact_id },
      });
    }
  }

  return { items, total: count ?? 0, page, pageSize };
}

export async function repararEntregasFallidas(
  contactIds: string[],
  dryRun = false,
): Promise<{ reparados: number; omitidos: number }> {
  if (!contactIds.length) return { reparados: 0, omitidos: 0 };

  if (dryRun) {
    return { reparados: contactIds.length, omitidos: 0 };
  }

  const supabase = createServiceClient() as any;
  const { error, count } = await supabase
    .from("ghl_campana_logs")
    .delete({ count: "exact" })
    .eq("campana", CAMPANA_ACTIVA)
    .in("ghl_contact_id", contactIds) as { error: unknown; count: number | null };

  if (error) {
    void logSistema({
      categoria:  "servicio",
      tipoAccion: "ghl_auditoria.reparacion",
      fase:       "error",
      resultado:  String(error),
      metadata:   { contactIds: contactIds.length },
    });
    throw new Error("Error al limpiar registros de campaña");
  }

  const reparados = count ?? contactIds.length;
  void logSistema({
    categoria:  "servicio",
    tipoAccion: "ghl_auditoria.reparacion",
    fase:       "ok",
    resultado:  `${reparados} registros eliminados para re-proceso`,
    metadata:   { campana: CAMPANA_ACTIVA, contactIds: contactIds.length },
  });

  return { reparados, omitidos: contactIds.length - reparados };
}

// Cuenta total de candidatos para el badge del panel
export async function contarCandidatosAuditoria(since: string): Promise<number> {
  const supabase = createServiceClient() as any;
  const { count } = await supabase
    .from("ghl_campana_logs")
    .select("*", { count: "exact", head: true })
    .eq("campana", CAMPANA_ACTIVA)
    .eq("enviado", true)
    .is("respuesta_tipo", null)
    .gte("enviado_at", since) as { count: number | null };
  return count ?? 0;
}
