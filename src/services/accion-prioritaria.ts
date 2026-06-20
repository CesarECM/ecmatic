// S21.3 — Motor de acción prioritaria única.
// Recopila todos los pendientes del sistema, los puntúa por urgencia
// y devuelve el único ítem más crítico que el admin debe resolver ahora.

import { createServiceClient } from "@/lib/supabase/service";

export interface AccionPrioritaria {
  tipo:        "comprobante" | "tarea" | "mensaje_cola" | "sugerencia";
  titulo:      string;
  descripcion: string;
  url:         string;
  urgencia:    number;       // 0–100
  leadId:      string | null;
  leadNombre:  string | null;
}

// ── Scores de urgencia ────────────────────────────────────────────────────
// Más alto = actuar antes. Determinista, sin IA.

const URGENCIA = {
  comprobante:              100,  // ingreso esperado, no confirmar = perdida
  tarea_cierre_vencida:      95,  // lead listo para comprar, plazo expirado
  mensaje_compra:            90,  // intención de compra en cola sin aprobar
  tarea_limpieza_vencida:    85,  // datos incompletos afectan automatizaciones
  mensaje_antiguo:           80,  // cola > 2 h sin aprobar
  tarea_cierre:              75,  // cierre activo, aún dentro de plazo
  sugerencia_urgente:        70,
  mensaje_cola:              60,  // cola reciente
  tarea_nutricion_vencida:   55,
  sugerencia_importante:     40,
  tarea_seguimiento_vencida: 35,
  tarea_informacion_vencida: 30,
} as const;

const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

// ── Consultas paralelas ───────────────────────────────────────────────────

export async function obtenerAccionPrioritaria(): Promise<AccionPrioritaria | null> {
  const supabase = createServiceClient();
  const ahora = new Date();

  const [
    { data: comprobantes },
    { data: tareas },
    { data: mensajesCola },
    { data: sugerencias },
  ] = await Promise.all([
    // Comprobantes de pago pendientes
    (supabase as any)
      .from("comprobantes_cola_revision")
      .select("id, telefono, created_at")
      .is("aprobado", null)
      .order("created_at")
      .limit(1),

    // Tareas activas (ordenadas por vencimiento más cercano)
    (supabase as any)
      .from("lead_tarea_activa")
      .select("lead_id, tipo, motivo, vence_at, leads(nombre)")
      .order("vence_at", { ascending: true, nullsFirst: false })
      .limit(10),

    // Mensajes en cola de aprobación pendientes
    (supabase as any)
      .from("mensajes_cola_aprobacion")
      .select("id, lead_id, respuesta, score_confianza, created_at, leads(nombre)")
      .is("aprobado", null)
      .order("created_at")
      .limit(10),

    // Sugerencias IA urgentes o importantes
    (supabase as any)
      .from("sugerencias_ia")
      .select("id, tipo, titulo, descripcion, prioridad")
      .is("aprobado", null)
      .in("prioridad", ["urgente", "importante"])
      .order("prioridad")
      .order("created_at")
      .limit(5),
  ]);

  const candidatos: (AccionPrioritaria & { _fecha: Date })[] = [];

  // ── 1. Comprobantes ───────────────────────────────────────────────────
  for (const c of (comprobantes ?? []).slice(0, 1)) {
    candidatos.push({
      tipo:        "comprobante",
      titulo:      "Comprobante de pago pendiente",
      descripcion: `Comprobante de ${c.telefono} esperando verificación. Sin aprobar no se confirma la inscripción.`,
      url:         "/admin/aprobaciones",
      urgencia:    URGENCIA.comprobante,
      leadId:      null,
      leadNombre:  null,
      _fecha:      new Date(c.created_at),
    });
  }

  // ── 2. Tareas ─────────────────────────────────────────────────────────
  for (const t of tareas ?? []) {
    const venceAt = t.vence_at ? new Date(t.vence_at) : null;
    const vencida  = venceAt ? venceAt < ahora : false;
    const leadNombre = t.leads?.nombre ?? null;

    let urgencia: number;
    if (t.tipo === "cierre")      urgencia = vencida ? URGENCIA.tarea_cierre_vencida   : URGENCIA.tarea_cierre;
    else if (t.tipo === "limpieza")urgencia = vencida ? URGENCIA.tarea_limpieza_vencida : 20;
    else if (t.tipo === "nutricion") urgencia = vencida ? URGENCIA.tarea_nutricion_vencida : 15;
    else if (t.tipo === "seguimiento") urgencia = vencida ? URGENCIA.tarea_seguimiento_vencida : 10;
    else urgencia = vencida ? URGENCIA.tarea_informacion_vencida : 5;

    candidatos.push({
      tipo:        "tarea",
      titulo:      `Tarea de ${t.tipo}${vencida ? " (vencida)" : ""}`,
      descripcion: t.motivo ?? `Lead ${leadNombre ?? "sin nombre"} requiere acción de ${t.tipo}.`,
      url:         `/admin/leads/${t.lead_id}`,
      urgencia,
      leadId:      t.lead_id,
      leadNombre,
      _fecha:      venceAt ?? ahora,
    });
  }

  // ── 3. Mensajes en cola ───────────────────────────────────────────────
  for (const m of mensajesCola ?? []) {
    const creadoEn  = new Date(m.created_at);
    const antiguo   = ahora.getTime() - creadoEn.getTime() > DOS_HORAS_MS;
    const esCompra  = m.respuesta?.toLowerCase().includes("compra") ||
                      m.respuesta?.toLowerCase().includes("pago")   ||
                      m.respuesta?.toLowerCase().includes("inscripci");
    const urgencia  = esCompra ? URGENCIA.mensaje_compra
                    : antiguo  ? URGENCIA.mensaje_antiguo
                    :            URGENCIA.mensaje_cola;

    candidatos.push({
      tipo:        "mensaje_cola",
      titulo:      "Mensaje pendiente de aprobación",
      descripcion: `"${(m.respuesta as string).slice(0, 100)}…"`,
      url:         "/admin/aprobaciones",
      urgencia,
      leadId:      m.lead_id,
      leadNombre:  m.leads?.nombre ?? null,
      _fecha:      creadoEn,
    });
  }

  // ── 4. Sugerencias urgentes ───────────────────────────────────────────
  for (const s of (sugerencias ?? []).slice(0, 1)) {
    candidatos.push({
      tipo:        "sugerencia",
      titulo:      s.titulo,
      descripcion: s.descripcion,
      url:         "/admin/aprobaciones",
      urgencia:    s.prioridad === "urgente" ? URGENCIA.sugerencia_urgente : URGENCIA.sugerencia_importante,
      leadId:      null,
      leadNombre:  null,
      _fecha:      ahora,
    });
  }

  if (!candidatos.length) return null;

  // Ordenar: mayor urgencia primero; desempate por fecha más antigua
  candidatos.sort((a, b) =>
    b.urgencia - a.urgencia || a._fecha.getTime() - b._fecha.getTime()
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _fecha, ...accion } = candidatos[0];
  return accion;
}

// ── Resumen de conteos para el panel ─────────────────────────────────────

export interface ResumenPendientes {
  comprobantes: number;
  tareasCierre: number;
  mensajesCola: number;
  sugerenciasUrgentes: number;
  total: number;
}

export async function obtenerResumenPendientes(): Promise<ResumenPendientes> {
  const supabase = createServiceClient();

  const [c, t, m, s] = await Promise.all([
    (supabase as any).from("comprobantes_cola_revision").select("id", { count: "exact", head: true }).is("aprobado", null),
    (supabase as any).from("lead_tarea_activa").select("id", { count: "exact", head: true }).eq("tipo", "cierre"),
    (supabase as any).from("mensajes_cola_aprobacion").select("id", { count: "exact", head: true }).is("aprobado", null),
    (supabase as any).from("sugerencias_ia").select("id", { count: "exact", head: true }).is("aprobado", null).eq("prioridad", "urgente"),
  ]);

  const comprobantes      = c.count ?? 0;
  const tareasCierre      = t.count ?? 0;
  const mensajesCola      = m.count ?? 0;
  const sugerenciasUrgentes = s.count ?? 0;

  return {
    comprobantes,
    tareasCierre,
    mensajesCola,
    sugerenciasUrgentes,
    total: comprobantes + tareasCierre + mensajesCola + sugerenciasUrgentes,
  };
}
