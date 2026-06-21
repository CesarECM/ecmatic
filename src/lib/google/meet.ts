// S26.2 — Google Meet REST API v2: transcriptos post-sesión
// S26.1 Hallazgo: Meet API v2 entrega transcriptos de texto (estado FILE_GENERATED).
// Los summaries nativos de Gemini for Workspace no tienen API pública para terceros (S26.3).
// S26.4 Decisión: ruta cruda → Meet API → texto → Claude vía guardarTranscripto (S7.7).
// Scope adicional requerido: https://www.googleapis.com/auth/meetings.space.readonly
// Vendors existentes deben re-autorizar para obtener ese scope.

const BASE = "https://meet.googleapis.com/v2";

interface ConferenceRecord {
  name: string; // "conferenceRecords/{id}"
  startTime: string;
  endTime?: string;
}

interface MeetTranscript {
  name: string; // "conferenceRecords/{id}/transcripts/{id}"
  state: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
}

interface TranscriptEntry {
  name: string;
  participantSession: string; // resource reference, not embedded
  text: string;
  startTime: string;
  endTime: string;
}

export function extractMeetCode(meetUrl: string): string | null {
  const match = meetUrl.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return match?.[1] ?? null;
}

// Busca el ConferenceRecord más reciente para un meeting code
export async function buscarConferenceRecord(
  accessToken: string,
  meetCode: string
): Promise<ConferenceRecord | null> {
  const filter = `space.meeting_code="${meetCode}"`;
  const res = await fetch(
    `${BASE}/conferenceRecords?filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[meet] ${res.status}: ${body}`);
  }
  const data = await res.json() as { conferenceRecords?: ConferenceRecord[] };
  const records = data.conferenceRecords ?? [];
  records.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  return records[0] ?? null;
}

// Obtiene el texto concatenado del transcripto completo de un conference record
export async function obtenerTextoTranscripto(
  accessToken: string,
  conferenceRecordName: string
): Promise<string | null> {
  // 1. Listar transcriptos del conference record
  const transRes = await fetch(
    `${BASE}/${conferenceRecordName}/transcripts`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!transRes.ok) return null;

  const transData = await transRes.json() as { transcripts?: MeetTranscript[] };
  const transcript = transData.transcripts?.find((t) => t.state === "FILE_GENERATED");
  if (!transcript) return null;

  // 2. Obtener entradas (paginado simple: primera página, 500 entradas máx)
  const entriesRes = await fetch(
    `${BASE}/${transcript.name}/entries?pageSize=500`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!entriesRes.ok) return null;

  const entriesData = await entriesRes.json() as { transcriptEntries?: TranscriptEntry[] };
  const entries = entriesData.transcriptEntries ?? [];
  if (!entries.length) return null;

  // El campo participantSession es una referencia de recurso — omitimos el nombre del hablante
  // para simplificar; el motor IA (S7.7) extrae objeciones/compromisos sin necesitar quién habló.
  return entries.map((e) => e.text).join("\n");
}
