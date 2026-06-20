import { createServiceClient } from "@/lib/supabase/service";

export interface MensajeEnCola {
  id: string;
  lead_id: string;
  telefono: string;
  respuesta: string;
  bloques: string[];
  score_confianza: number | null;
  created_at: string;
}

// S17.3/S17.4 — Encola una respuesta para aprobación manual
export async function encolarRespuesta(params: {
  leadId: string;
  telefono: string;
  respuesta: string;
  bloques: string[];
  scoreConfianza?: number;
}): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any).from("mensajes_cola_aprobacion").insert({
    lead_id: params.leadId,
    telefono: params.telefono,
    respuesta: params.respuesta,
    bloques: params.bloques,
    aprobado: null,
    score_confianza: params.scoreConfianza ?? null,
  });
}

// S17.3 — Lista mensajes pendientes de aprobación
export async function listarMensajesPendientes(): Promise<
  (MensajeEnCola & { lead_nombre: string | null })[]
> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .select("*, leads(nombre)")
    .is("aprobado", null)
    .order("created_at");

  return (data ?? []).map((m: any) => ({
    ...m,
    bloques: m.bloques as string[],
    score_confianza: m.score_confianza ?? null,
    lead_nombre: m.leads?.nombre ?? null,
  }));
}

// S17.3 — Rechaza un mensaje encolado
export async function rechazarMensaje(id: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .update({ aprobado: false })
    .eq("id", id);
}

// S17.3 — Marca como enviado (llamado después de enviar el WA)
export async function marcarMensajeEnviado(id: string): Promise<void> {
  const supabase = createServiceClient();
  await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .update({ aprobado: true })
    .eq("id", id);
}
