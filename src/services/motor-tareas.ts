// S17.6/S17.7 — Motor de asignación y cierre de tarea de fondo
import { createServiceClient } from "@/lib/supabase/service";
import { asignarTarea, cerrarTarea, obtenerTareaActiva } from "./tareas";
import { archivarLead, agregarABlacklist } from "./limpieza-leads";
import type { TipoTarea } from "@/lib/supabase/types";

// ── Tipos internos ────────────────────────────────────────────────────────

interface EstadoLead {
  pipeline_stage: string;
  nombre: string | null;
  email: string | null;
  compra_previa: boolean;
  activo: boolean;
}

// ── Leer estado del lead en una sola query ────────────────────────────────

async function leerEstadoLead(leadId: string): Promise<EstadoLead | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("leads")
    .select("pipeline_stage, nombre, email, compra_previa, activo")
    .eq("id", leadId)
    .maybeSingle();
  return data as EstadoLead | null;
}

async function leerFaseCagc(leadId: string): Promise<number | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("lead_cagc_estado")
    .select("fase_numero")
    .eq("lead_id", leadId)
    .maybeSingle();
  return (data?.fase_numero as number) ?? null;
}

// ── Motor de reglas — prioridad descendente ───────────────────────────────
//
// 1. LIMPIEZA   — faltan nombre o email y el lead ya avanzó del primer contacto
// 2. CIERRE     — etapa Propuesta/Negociación, o CAGC fase 9-10 (decisión/compra)
// 3. NUTRICION  — etapa Interesado, o CAGC fases 5-8 (evaluación/validación)
// 4. INFORMACION— etapa Nuevo/Contactado, o CAGC fases 0-4 (exploración)
// 5. SEGUIMIENTO— catch-all: lead activo sin otro motivo urgente
//
// Guarda: lead Comprado o inactivo → sin tarea.

function inferirTipo(
  estado: EstadoLead,
  faseCagc: number | null
): { tipo: TipoTarea; motivo: string } | null {
  if (!estado.activo || estado.compra_previa) return null;

  const stage = estado.pipeline_stage;

  if (stage === "Comprado") return null;

  // 1. Limpieza — datos incompletos en lead que ya interactuó
  if ((!estado.nombre || !estado.email) && stage !== "Nuevo") {
    return {
      tipo: "limpieza",
      motivo: `Faltan datos: ${[!estado.nombre && "nombre", !estado.email && "email"].filter(Boolean).join(", ")}`,
    };
  }

  // 2. Cierre — lead en zona de decisión (stage o CAGC)
  if (stage === "Propuesta" || stage === "Negociación") {
    return { tipo: "cierre", motivo: `Lead en etapa ${stage} — ventana de cierre activa` };
  }
  if (faseCagc !== null && faseCagc >= 9 && faseCagc <= 10) {
    return { tipo: "cierre", motivo: `Lead en fase CAGC ${faseCagc} (decisión/compra) — actuar ahora` };
  }

  // 3. Nutrición — lead evaluando opciones
  if (stage === "Interesado" || (faseCagc !== null && faseCagc >= 5 && faseCagc <= 8)) {
    return { tipo: "nutricion", motivo: `Lead evaluando opciones (CAGC ${faseCagc ?? "—"}, stage ${stage})` };
  }

  // 4. Información — lead en etapa temprana
  if (stage === "Nuevo" || stage === "Contactado" || (faseCagc !== null && faseCagc <= 4)) {
    return { tipo: "informacion", motivo: `Lead en exploración temprana (CAGC ${faseCagc ?? "—"}, stage ${stage})` };
  }

  // 5. Seguimiento — cualquier otro lead activo
  return { tipo: "seguimiento", motivo: `Lead activo sin urgencia inmediata — mantener contacto` };
}

// ── Punto de entrada público ──────────────────────────────────────────────

// ── S17.7: Procesamiento de tareas vencidas ───────────────────────────────

const KEYWORDS_BAJA = [
  "stop", "baja", "bajarme", "no me contactes", "no quiero", "quitar",
  "déjenme", "dejen de", "no me manden", "molestando", "spam", "no me llamen",
];

function detectarSolicitudBaja(texto: string): boolean {
  const t = texto.toLowerCase();
  return KEYWORDS_BAJA.some((k) => t.includes(k));
}

async function ultimoMensajeEntrante(leadId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("mensajes")
    .select("contenido")
    .eq("lead_id", leadId)
    .eq("direccion", "entrante")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.contenido as string) ?? null;
}

// S17.7 — Procesa tareas vencidas y cierra hacia dos destinos finales:
//   blacklist → lead pidió explícitamente no ser contactado
//   archivo   → lead inactivo (no respondió en el plazo de la tarea)
// Retorna el conteo de tareas procesadas.
export async function procesarTareasVencidas(): Promise<{ archivados: number; blacklisted: number }> {
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();

  const { data: vencidas } = await (supabase as any)
    .from("lead_tarea_activa")
    .select("lead_id, tipo, vence_at, leads(activo, archivado, telefono, updated_at)")
    .lt("vence_at", ahora)
    .limit(50);

  let archivados = 0;
  let blacklisted = 0;

  for (const tarea of vencidas ?? []) {
    const lead = tarea.leads;
    if (!lead?.activo || lead.archivado) {
      await cerrarTarea(tarea.lead_id);
      continue;
    }

    // Si hubo actividad del lead DESPUÉS de que la tarea venció,
    // la reevaluación por conversación ya se encargará — saltamos.
    if (lead.updated_at > tarea.vence_at) continue;

    const ultimoMensaje = await ultimoMensajeEntrante(tarea.lead_id);

    if (ultimoMensaje && detectarSolicitudBaja(ultimoMensaje)) {
      await agregarABlacklist(
        { telefono: lead.telefono },
        "solicitud_eliminacion"
      );
      blacklisted++;
    } else {
      await archivarLead(
        tarea.lead_id,
        `Tarea "${tarea.tipo}" vencida sin respuesta del lead`
      );
      archivados++;
    }

    await cerrarTarea(tarea.lead_id);
  }

  return { archivados, blacklisted };
}

// ── S17.6: Asignación por evento ──────────────────────────────────────────

// evento: etiqueta de contexto para trazabilidad ("conversacion", "pipeline_movimiento", etc.)
export async function evaluarYAsignarTarea(
  leadId: string,
  evento: string
): Promise<void> {
  const [estado, faseCagc, tareaActual] = await Promise.all([
    leerEstadoLead(leadId),
    leerFaseCagc(leadId),
    obtenerTareaActiva(leadId),
  ]);

  if (!estado) return;

  const inferido = inferirTipo(estado, faseCagc);

  // Lead sin tarea aplicable (comprado, inactivo) → cerrar si tenía una
  if (!inferido) {
    if (tareaActual) await cerrarTarea(leadId);
    return;
  }

  // Si el tipo no cambia, no resetear vence_at innecesariamente
  if (tareaActual?.tipo === inferido.tipo) return;

  await asignarTarea(
    leadId,
    inferido.tipo,
    `[${evento}] ${inferido.motivo}`
  );
}
