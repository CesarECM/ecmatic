import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { enviarEmail, type EmailPayload } from "@/lib/email/resend";
import { logDebugIA } from "@/services/log-ia";

export type TipoEmailInterceptado = "bienvenida" | "nurturing" | "notif_cita" | "otro";

export interface EmailInterceptado {
  id: string;
  lead_id: string | null;
  para: string;
  asunto: string;
  html: string;
  tipo: TipoEmailInterceptado;
  leido: boolean;
  created_at: string;
  leads?: { nombre: string | null; telefono: string | null } | null;
}

// Chequea el modo: si es depuracion, guarda en bandeja interna; si no, envía al lead.
export async function interceptarOEnviarEmail(
  payload: EmailPayload & { leadId?: string; tipo?: TipoEmailInterceptado }
): Promise<void> {
  const modo = await obtenerModo().catch(() => "automatico" as const);

  if (modo === "depuracion") {
    const supabase = createServiceClient();
    const para = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;

    const { error } = await (supabase as any).from("bandeja_email_interceptado").insert({
      lead_id: payload.leadId ?? null,
      para,
      asunto: payload.subject,
      html: payload.html,
      tipo: payload.tipo ?? "otro",
    });

    if (error) {
      console.error("[bandeja-email] Error guardando email interceptado:", error.message);
      return;
    }

    void logDebugIA(
      "DEPURACION_EMAIL_INTERCEPTADO",
      `[DEPURACION] Email a ${para} interceptado — asunto: ${payload.subject}`,
      { para, tipo: payload.tipo ?? "otro", lead_id: payload.leadId ?? null, asunto: payload.subject }
    );
    return;
  }

  // Modo normal: enviar al lead
  const { leadId: _unused, tipo: _tipo, ...emailPayload } = payload;
  await enviarEmail(emailPayload);
}

export async function listarEmailsInterceptados(opts?: {
  leadId?: string;
  soloNoLeidos?: boolean;
  limite?: number;
}): Promise<EmailInterceptado[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("bandeja_email_interceptado")
    .select("*, leads(nombre, telefono)")
    .order("created_at", { ascending: false })
    .limit(opts?.limite ?? 50);

  if (opts?.leadId)      q = (q as any).eq("lead_id", opts.leadId);
  if (opts?.soloNoLeidos) q = (q as any).eq("leido", false);

  const { data, error } = await q;
  if (error) throw new Error(`[bandeja-email] ${error.message}`);
  return (data ?? []) as EmailInterceptado[];
}

export async function marcarEmailLeido(id: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("bandeja_email_interceptado")
    .update({ leido: true })
    .eq("id", id)
    .throwOnError();
}

export async function contarEmailsNoLeidos(): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("bandeja_email_interceptado")
    .select("id", { count: "exact", head: true })
    .eq("leido", false);
  if (error) return 0;
  return count ?? 0;
}
