import { createServiceClient } from "@/lib/supabase/service";
import { isConfigured, getFreeBusy, refreshAccessToken, createCalendarEvent } from "@/lib/google/calendar";
import type { EstadoCita, ResultadoCita } from "@/lib/supabase/types";

export interface SlotDisponible {
  inicio: Date;
  fin: Date;
  vendedorId: string;
  vendedorNombre: string;
}

// S7.1 — Crea una cita y la sincroniza con Google Calendar si hay token
export async function crearCita(params: {
  leadId: string;
  vendedorId: string;
  inicio: Date;
  fin: Date;
  notasPrevias?: string;
}): Promise<string> {
  const supabase = createServiceClient();

  const { data: cita, error } = await supabase
    .from("citas")
    .insert({
      lead_id: params.leadId,
      vendedor_id: params.vendedorId,
      fecha_inicio: params.inicio.toISOString(),
      fecha_fin: params.fin.toISOString(),
      notas_previas: params.notasPrevias ?? null,
    })
    .select("id")
    .single();

  if (error || !cita) throw new Error(`[citas] Error creando cita: ${error?.message}`);

  void sincronizarConCalendar(cita.id, params.leadId, params.vendedorId, params.inicio, params.fin);
  return cita.id;
}

async function sincronizarConCalendar(
  citaId: string, leadId: string, vendedorId: string, inicio: Date, fin: Date
): Promise<void> {
  if (!isConfigured()) return;
  try {
    const supabase = createServiceClient();
    const [{ data: tokenRow }, { data: lead }, { data: vendedor }] = await Promise.all([
      supabase.from("vendedor_tokens").select("*").eq("vendedor_id", vendedorId).maybeSingle(),
      supabase.from("leads").select("nombre, email").eq("id", leadId).single(),
      supabase.from("vendedores").select("nombre, email").eq("id", vendedorId).single(),
    ]);
    if (!tokenRow || !vendedor) return;

    let token = tokenRow.access_token;
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      token = refreshed.access_token;
      await supabase.from("vendedor_tokens")
        .update({ access_token: token, expires_at: refreshed.expires_at })
        .eq("vendedor_id", vendedorId);
    }

    const { eventId, meetLink } = await createCalendarEvent(token, {
      titulo: `Cita ECMatic — ${lead?.nombre ?? "Lead"}`,
      descripcion: `Cita de asesoría para certificación CONOCER`,
      inicio, fin,
      emailLead: lead?.email ?? null,
      emailVendedor: vendedor.email,
    });

    await supabase.from("citas").update({ google_event_id: eventId, google_meet_link: meetLink }).eq("id", citaId);
  } catch (err) {
    console.error("[citas] Error sincronizando Calendar:", err);
  }
}

// S25.2 — Elige el vendedor con mayor déficit proporcional según su peso (0–100)
export async function asignarMejorVendedor(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: vendedores } = await supabase
    .from("vendedores").select("id, peso").eq("activo", true);
  if (!vendedores?.length) return null;

  const activos = vendedores.filter((v) => (v.peso ?? 50) > 0);
  if (!activos.length) return null;
  if (activos.length === 1) return activos[0].id;

  const totalPeso = activos.reduce((sum, v) => sum + (v.peso ?? 50), 0);
  const ids = activos.map((v) => v.id);

  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);

  const { data: citasRecientes } = await supabase
    .from("citas").select("vendedor_id")
    .in("vendedor_id", ids)
    .gte("created_at", hace30.toISOString());

  const conteo = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const c of citasRecientes ?? []) {
    if (c.vendedor_id) conteo.set(c.vendedor_id, (conteo.get(c.vendedor_id) ?? 0) + 1);
  }
  const totalCitas = [...conteo.values()].reduce((a, b) => a + b, 0);

  const conDeficit = activos.map((v) => ({
    id: v.id,
    deficit:
      (v.peso ?? 50) / totalPeso -
      (totalCitas > 0 ? (conteo.get(v.id) ?? 0) / totalCitas : 0),
  }));
  conDeficit.sort((a, b) => b.deficit - a.deficit);
  return conDeficit[0].id;
}

// S7.3 — Genera 3 slots disponibles en los próximos 2 días hábiles
export async function obtenerSlotsDisponibles(vendedorId: string): Promise<SlotDisponible[]> {
  const supabase = createServiceClient();
  const { data: vendedor } = await supabase.from("vendedores").select("nombre").eq("id", vendedorId).single();
  const { data: citasExistentes } = await supabase.from("citas")
    .select("fecha_inicio, fecha_fin")
    .eq("vendedor_id", vendedorId).in("estado", ["pendiente", "confirmada"]);

  const ocupados = (citasExistentes ?? []).map((c) => ({ inicio: c.fecha_inicio, fin: c.fecha_fin }));
  const slots: SlotDisponible[] = [];
  const candidato = new Date();
  candidato.setHours(candidato.getHours() + 2, 0, 0, 0);

  while (slots.length < 3) {
    const dia = candidato.getDay();
    if (dia !== 0 && dia !== 6) {
      const horas = [10, 12, 15, 17];
      for (const h of horas) {
        if (slots.length >= 3) break;
        const inicio = new Date(candidato);
        inicio.setHours(h, 0, 0, 0);
        const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
        const ocupado = ocupados.some((o) =>
          new Date(o.inicio) < fin && new Date(o.fin) > inicio
        );
        if (!ocupado && inicio > new Date()) {
          slots.push({ inicio, fin, vendedorId, vendedorNombre: vendedor?.nombre ?? "Asesor" });
        }
      }
    }
    candidato.setDate(candidato.getDate() + 1);
  }
  return slots;
}

export async function listarCitas(filtros?: { vendedorId?: string; estado?: EstadoCita }) {
  const supabase = createServiceClient();
  let q = supabase.from("citas")
    .select("*, leads(nombre, telefono), vendedores(nombre)")
    .order("fecha_inicio", { ascending: true });
  if (filtros?.vendedorId) q = q.eq("vendedor_id", filtros.vendedorId);
  if (filtros?.estado) q = q.eq("estado", filtros.estado);
  const { data, error } = await q;
  if (error) throw new Error(`[citas] ${error.message}`);
  return data ?? [];
}

export async function actualizarEstadoCita(id: string, estado: EstadoCita): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("citas").update({ estado }).eq("id", id);
}

export async function registrarPostSesion(id: string, datos: {
  resultado: ResultadoCita; notas: string; compromisos: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("citas").update({
    resultado: datos.resultado,
    notas_vendedor: datos.notas,
    compromisos: datos.compromisos,
    estado: datos.resultado === "show" ? "show" : "noshow",
  }).eq("id", id);
}
