// Google Calendar API client — graceful-off si faltan credenciales

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback";
// S26.2: meetings.space.readonly permite leer conferenceRecords y transcriptos de Meet
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

export function getAuthUrl(vendedorId: string): string {
  if (!isConfigured()) throw new Error("[google] Credenciales no configuradas");
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: vendedorId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string | null; expires_at: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
    }),
  });
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!data.access_token) throw new Error("[google] Error en exchange de código");
  const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { access_token: data.access_token, refresh_token: data.refresh_token ?? null, expires_at };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string; expires_at: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const data = await res.json() as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error("[google] Error refrescando token");
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// Consulta disponibilidad de un calendario en un rango de tiempo
export async function getFreeBusy(
  accessToken: string,
  calendarId: string,
  desde: Date,
  hasta: Date
): Promise<{ inicio: string; fin: string }[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: desde.toISOString(), timeMax: hasta.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  const data = await res.json() as { calendars: Record<string, { busy: { start: string; end: string }[] }> };
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ inicio: b.start, fin: b.end }));
}

// Crea un evento en Google Calendar con link de Meet
export async function createCalendarEvent(
  accessToken: string,
  params: {
    titulo: string; descripcion: string;
    inicio: Date; fin: Date;
    emailLead: string | null; emailVendedor: string;
  }
): Promise<{ eventId: string; meetLink: string | null }> {
  const attendees = [{ email: params.emailVendedor }];
  if (params.emailLead) attendees.push({ email: params.emailLead });

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: params.titulo,
        description: params.descripcion,
        start: { dateTime: params.inicio.toISOString() },
        end: { dateTime: params.fin.toISOString() },
        attendees,
        conferenceData: {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }),
    }
  );
  const data = await res.json() as { id: string; conferenceData?: { entryPoints?: { uri: string; entryPointType: string }[] } };
  const meetLink = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null;
  return { eventId: data.id, meetLink };
}
