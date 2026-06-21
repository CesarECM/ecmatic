// S26.2 — Orquestación: obtiene transcripto de Meet y lo procesa con el motor IA existente (S7.7)
import { createServiceClient } from "@/lib/supabase/service";
import { refreshAccessToken } from "@/lib/google/calendar";
import { extractMeetCode, buscarConferenceRecord, obtenerTextoTranscripto } from "@/lib/google/meet";
import { guardarTranscripto } from "@/services/transcriptos";

export type ResultadoTranscripto =
  | { ok: true; transcriptoId: string }
  | { ok: false; razon: "sin_meet_link" | "sin_token" | "sin_scope" | "sin_record" | "sin_transcripto" | "error"; detalle?: string };

// Busca el transcripto de Meet asociado a una cita y lo procesa con IA (S7.7)
export async function procesarTranscriptoMeet(citaId: string): Promise<ResultadoTranscripto> {
  const supabase = createServiceClient();

  const { data: cita, error: citaErr } = await supabase
    .from("citas")
    .select("id, lead_id, vendedor_id, google_meet_link")
    .eq("id", citaId)
    .single();

  if (citaErr || !cita) return { ok: false, razon: "error", detalle: citaErr?.message };
  if (!cita.google_meet_link || !cita.vendedor_id) return { ok: false, razon: "sin_meet_link" };

  const meetCode = extractMeetCode(cita.google_meet_link);
  if (!meetCode) return { ok: false, razon: "sin_meet_link" };

  // Obtener token del vendedor
  const vendedorId = cita.vendedor_id; // ya verificado no-null arriba

  const { data: tokenRow } = await supabase
    .from("vendedor_tokens")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .maybeSingle();

  if (!tokenRow) return { ok: false, razon: "sin_token" };

  let token = tokenRow.access_token;
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      token = refreshed.access_token;
      await supabase
        .from("vendedor_tokens")
        .update({ access_token: token, expires_at: refreshed.expires_at })
        .eq("vendedor_id", vendedorId);
    } catch {
      return { ok: false, razon: "sin_token" };
    }
  }

  // Buscar conference record por código de Meet
  let conferenceRecord;
  try {
    conferenceRecord = await buscarConferenceRecord(token, meetCode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 403 → el token no tiene el scope meetings.space.readonly → vendor debe re-autorizar
    if (msg.includes("403")) return { ok: false, razon: "sin_scope" };
    return { ok: false, razon: "error", detalle: msg };
  }

  if (!conferenceRecord) return { ok: false, razon: "sin_record" };

  // Obtener texto del transcripto
  const texto = await obtenerTextoTranscripto(token, conferenceRecord.name);
  if (!texto) return { ok: false, razon: "sin_transcripto" };

  // Guardar y procesar con IA (S7.7 existente)
  const transcriptoId = await guardarTranscripto({
    leadId: cita.lead_id,
    citaId,
    contenido: texto,
  });

  return { ok: true, transcriptoId };
}
