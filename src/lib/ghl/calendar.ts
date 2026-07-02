import { ghlGet, ghlPost } from "./client";
import { logAgen } from "@/services/log-agendamiento";
import type { SlotDisponible } from "@/services/citas";

// Duración de cada slot en minutos — debe coincidir con la configuración del calendario en GHL
const SLOT_DURACION_MIN = 30;
// México eliminó el horario de verano en octubre 2022 → CDMX es UTC-6 permanente
const CDMX_OFFSET_H = 6;
const TIMEZONE = "America/Mexico_City";

interface GHLFreeSlotsResponse {
  slots?: Record<string, { slots?: string[] } | string[]>;
}

interface GHLAppointmentResponse {
  id?: string;
  appointment?: { id?: string };
}

// ISO sin milisegundos con +00:00 — formato requerido por la API de GHL
function toGHLTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

// Consulta los slots disponibles en un calendario GHL.
// Retorna los primeros `max` slots como SlotDisponible[] (misma interfaz que el flujo Google Calendar).
export async function obtenerSlotsGHL(
  calendarId: string,
  vendedorId: string,
  vendedorNombre: string,
  dias = 10,
  max = 3,
): Promise<SlotDisponible[]> {
  const desde = Date.now() + 2 * 3_600_000; // mínimo 2h desde ahora
  const hasta = Date.now() + dias * 24 * 3_600_000;

  const data = await ghlGet<GHLFreeSlotsResponse>(`/calendars/${calendarId}/free-slots`, {
    startDate: String(desde),
    endDate: String(hasta),
    timezone: TIMEZONE,
  });

  const slotsRaw = data.slots ?? {};
  const fechas = Object.keys(slotsRaw).sort();
  const slots: SlotDisponible[] = [];

  for (const fechaKey of fechas) {
    if (slots.length >= max) break;

    const entrada = slotsRaw[fechaKey];
    // GHL puede devolver { slots: [...] } o directamente [...] según versión
    const horas: string[] = Array.isArray(entrada)
      ? entrada
      : (entrada as { slots?: string[] }).slots ?? [];

    const [year, month, day] = fechaKey.split("-").map(Number);

    for (const horaStr of horas) {
      if (slots.length >= max) break;

      const [hour, minute] = horaStr.split(":").map(Number);
      // "HH:mm" en CDMX → UTC: sumar offset
      const inicio = new Date(Date.UTC(year, month - 1, day, hour + CDMX_OFFSET_H, minute, 0));
      const fin    = new Date(inicio.getTime() + SLOT_DURACION_MIN * 60_000);

      if (inicio.getTime() > Date.now() + 5 * 60_000) {
        slots.push({ inicio, fin, vendedorId, vendedorNombre });
      }
    }
  }

  void logAgen({
    paso: "slots_consultados", nivel: "info", vendedorId,
    detalle: `GHL Calendar: ${slots.length} slots disponibles`,
    metadata: { fuente: "ghl_calendar", calendarId, dias_revisados: dias },
  });

  return slots;
}

// Crea un appointment en GHL con el Meet link embebido en address y notes.
// Retorna el appointmentId o null si falla (no bloqueante para el flujo principal).
export async function crearAppointmentGHL(params: {
  calendarId: string;
  contactId: string;
  inicio: Date;
  fin: Date;
  titulo: string;
  meetLink?: string | null;
  notas?: string;
}): Promise<string | null> {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) {
    console.warn("[ghl/calendar] GHL_LOCATION_ID no configurado — appointment omitido");
    return null;
  }

  const body: Record<string, unknown> = {
    calendarId:        params.calendarId,
    locationId,
    contactId:         params.contactId,
    startTime:         toGHLTime(params.inicio),
    endTime:           toGHLTime(params.fin),
    title:             params.titulo,
    appointmentStatus: "confirmed",
  };

  if (params.meetLink) {
    body.address = params.meetLink;
    body.notes   = `Link de sesión Google Meet: ${params.meetLink}` +
                   (params.notas ? `\n\n${params.notas}` : "");
  } else if (params.notas) {
    body.notes = params.notas;
  }

  try {
    const res = await ghlPost<GHLAppointmentResponse>("/calendars/events/appointments", body);
    // GHL puede devolver { id } o { appointment: { id } }
    return res.id ?? res.appointment?.id ?? null;
  } catch (err) {
    console.error("[ghl/calendar] Error creando appointment:", err);
    return null;
  }
}
