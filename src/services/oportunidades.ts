// MPS-36 S123.2/S123.3 — Smart Panel v2: pool ilimitado, scoring compuesto, momentum, ancla, fecha_compromiso.
// MPS-34/35 — base del CRUD de notas y panel.

import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

export interface OportunidadNota {
  id: string;
  contenido: string;
  created_at: string;
  updated_at: string;
}

export interface OportunidadRow {
  id: string;
  lead_id: string;
  posicion: number;
  notas_admin: string;
  resumen_ia: string | null;
  siguiente_accion_ia: string | null;
  score_cierre: number;
  razon_score: string | null;
  ia_sugiere: "ninguna" | "cerrar_ganado" | "cerrar_perdido" | "upsell";
  ia_razon: string | null;
  activo: boolean;
  ultima_ia_at: string | null;
  // MPS-36
  valor_ticket: number | null;
  fecha_compromiso: string | null;
  pregunta_clave: string | null;
  fijado: boolean;
  momentum_score: number;
  momentum_at: string | null;
  // relaciones
  oportunidades_notas: OportunidadNota[];
  leads: {
    nombre: string | null;
    telefono: string | null;
    email: string | null;
    pipeline_stage: string | null;
    pipeline_ruta: string | null;
    score_salud: number;
    temperamento_inferido: string | null;
    ghl_contact_id?: string | null;
    updated_at: string;
  } | null;
  // calculado en runtime
  prioridad_compuesta?: number;
}

export interface OportunidadLista {
  top10: OportunidadRow[];
  esperando: OportunidadRow[];   // fecha_compromiso futura
  seguimiento: OportunidadRow[]; // activos más allá del top 10
}

export interface CandidatoLead {
  id: string;
  nombre: string | null;
  telefono: string | null;
  pipeline_stage: string | null;
  score_salud: number;
  updated_at: string;
  memoria_ia: string | null;
}

// ── Motor de prioridad compuesta ──────────────────────────────────────────────

// Half-life de 24h: el momentum se reduce a la mitad cada 24 horas.
const MOMENTUM_HALF_LIFE_H = 24;

export function calcularMomentumDecay(score: number, momentumAt: string | null): number {
  if (!score || !momentumAt) return 0;
  const horasTranscurridas = (Date.now() - new Date(momentumAt).getTime()) / 3_600_000;
  return score * Math.pow(2, -horasTranscurridas / MOMENTUM_HALF_LIFE_H);
}

/**
 * Calcula la prioridad compuesta de un lead dentro del pool.
 * Pure function: no hace llamadas a BD.
 * maxValorPool: el valor_ticket más alto del pool (para normalizar).
 */
export function calcularPrioridadCompuesta(op: OportunidadRow, maxValorPool: number): number {
  const now = Date.now();

  // Normalizar valor del ticket (0-100)
  const valorNorm = op.valor_ticket && maxValorPool > 0
    ? Math.min(100, (op.valor_ticket / maxValorPool) * 100)
    : 0;

  // Urgencia temporal: +20 si fecha_compromiso en las próximas 48h
  let urgencia = 0;
  if (op.fecha_compromiso) {
    const msHasta = new Date(op.fecha_compromiso).getTime() - now;
    if (msHasta > 0 && msHasta <= 48 * 3_600_000) urgencia = 20;
  }

  // Recency: +10 si el lead tuvo actividad en las últimas 48h
  const actualizacion = op.leads?.updated_at &&
    (now - new Date(op.leads.updated_at).getTime()) <= 48 * 3_600_000
    ? 10 : 0;

  const momentumDecay = calcularMomentumDecay(op.momentum_score, op.momentum_at);

  return (
    op.score_cierre * 0.38 +
    valorNorm       * 0.28 +
    (op.leads?.score_salud ?? 0) * 0.18 +
    momentumDecay   * 0.10 +
    urgencia        * 0.04 +
    actualizacion   * 0.02
  );
}

// ── Consulta principal ────────────────────────────────────────────────────────

const SELECT_FIELDS = `
  id, lead_id, posicion, notas_admin, resumen_ia, siguiente_accion_ia,
  score_cierre, razon_score, ia_sugiere, ia_razon, activo, ultima_ia_at,
  valor_ticket, fecha_compromiso, pregunta_clave, fijado, momentum_score, momentum_at,
  oportunidades_notas(id, contenido, created_at, updated_at),
  leads(nombre, telefono, email, pipeline_stage, pipeline_ruta, score_salud,
        temperamento_inferido, ghl_contact_id, updated_at)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

function sortearNotas(rows: OportunidadRow[]): OportunidadRow[] {
  return rows.map((row) => ({
    ...row,
    oportunidades_notas: [...(row.oportunidades_notas ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  }));
}

/**
 * Devuelve TODOS los leads activos del panel, separados en tres grupos:
 * - top10: sin fecha_compromiso futura, ordenados por prioridad, cap 10.
 * - esperando: fecha_compromiso en el futuro.
 * - seguimiento: activos pero fuera del top 10.
 *
 * Los leads con fijado=true mantienen su posicion manual dentro del top10.
 */
export async function listarTodosActivos(): Promise<OportunidadLista> {
  const { data, error } = await db()
    .from("oportunidades_panel")
    .select(SELECT_FIELDS)
    .eq("activo", true)
    .order("posicion", { ascending: true });

  if (error) throw new Error(`[oportunidades] listarTodosActivos: ${error.message}`);

  const todos = sortearNotas((data ?? []) as OportunidadRow[]);
  const now   = Date.now();

  // Separar leads con fecha_compromiso futura (van a "Esperando")
  const esperando   = todos.filter(
    (op) => op.fecha_compromiso && new Date(op.fecha_compromiso).getTime() > now
  );
  const disponibles = todos.filter(
    (op) => !op.fecha_compromiso || new Date(op.fecha_compromiso).getTime() <= now
  );

  // Calcular prioridad compuesta solo sobre disponibles
  const maxValor = Math.max(0, ...disponibles.map((op) => op.valor_ticket ?? 0));
  const conPrioridad = disponibles.map((op) => ({
    ...op,
    prioridad_compuesta: calcularPrioridadCompuesta(op, maxValor),
  }));

  // Fijados mantienen su posicion; no-fijados se reordenan por prioridad
  const fijados   = conPrioridad.filter((op) => op.fijado).sort((a, b) => a.posicion - b.posicion);
  const noFijados = conPrioridad.filter((op) => !op.fijado)
    .sort((a, b) => (b.prioridad_compuesta ?? 0) - (a.prioridad_compuesta ?? 0));

  // Construir top 10: fijados primero (por posición), luego no-fijados hasta completar 10
  const merged: OportunidadRow[] = [];
  const usados = new Set<string>();

  // Insertar fijados en sus posiciones relativas
  for (const op of fijados) {
    if (merged.length < 10) { merged.push(op); usados.add(op.id); }
  }
  // Rellenar con no-fijados hasta 10
  for (const op of noFijados) {
    if (merged.length >= 10) break;
    if (!usados.has(op.id)) { merged.push(op); usados.add(op.id); }
  }

  // Seguimiento: disponibles que no entraron al top 10
  const seguimiento = conPrioridad.filter((op) => !usados.has(op.id));

  return { top10: merged, esperando, seguimiento };
}

// Compatibilidad retroactiva con prepararLeadsParaAnalisis
export async function listarOportunidades(): Promise<OportunidadRow[]> {
  const { top10 } = await listarTodosActivos();
  return top10;
}

export async function contarOportunidadesActivas(): Promise<number> {
  const { count } = await db()
    .from("oportunidades_panel")
    .select("id", { count: "exact", head: true })
    .eq("activo", true);
  return count ?? 0;
}

export async function obtenerUltimaIaAt(): Promise<string | null> {
  const { data } = await db()
    .from("oportunidades_panel")
    .select("ultima_ia_at")
    .eq("activo", true)
    .not("ultima_ia_at", "is", null)
    .order("ultima_ia_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.ultima_ia_at ?? null;
}

// ── Momentum ──────────────────────────────────────────────────────────────────

export type MomentumTipo = "drag_reorder" | "agregar_al_panel" | "nota_escrita";

const MOMENTUM_PUNTOS: Record<MomentumTipo, number> = {
  drag_reorder:    15,
  agregar_al_panel: 10,
  nota_escrita:     5,
};

export async function registrarMomentum(leadId: string, tipo: MomentumTipo): Promise<void> {
  // Leer el momentum actual para decaerlo antes de sumar
  const { data } = await db()
    .from("oportunidades_panel")
    .select("momentum_score, momentum_at")
    .eq("lead_id", leadId)
    .eq("activo", true)
    .maybeSingle();

  const momentumDecaido = data
    ? calcularMomentumDecay(data.momentum_score ?? 0, data.momentum_at)
    : 0;
  const nuevo = Math.min(100, momentumDecaido + MOMENTUM_PUNTOS[tipo]);

  await db()
    .from("oportunidades_panel")
    .update({ momentum_score: nuevo, momentum_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("activo", true);
}

// ── Ancla ─────────────────────────────────────────────────────────────────────

export async function fijarEnPanel(leadId: string, fijado: boolean): Promise<void> {
  const { error } = await db()
    .from("oportunidades_panel")
    .update({ fijado })
    .eq("lead_id", leadId)
    .eq("activo", true);

  if (error) throw new Error(`[oportunidades] fijarEnPanel: ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.ancla",
    fase: "ok", leadId, resultado: fijado ? "fijado" : "liberado" });
}

// ── Editar campos del panel ───────────────────────────────────────────────────

export async function actualizarCamposPanel(
  oportunidadId: string,
  campos: { valor_ticket?: number | null; fecha_compromiso?: string | null }
): Promise<void> {
  const { error } = await db()
    .from("oportunidades_panel")
    .update(campos)
    .eq("id", oportunidadId)
    .eq("activo", true);

  if (error) throw new Error(`[oportunidades] actualizarCampos: ${error.message}`);
}

// ── CRUD notas ────────────────────────────────────────────────────────────────

export async function agregarNota(
  oportunidadId: string,
  leadId: string,
  contenido: string
): Promise<OportunidadNota> {
  const { data, error } = await db()
    .from("oportunidades_notas")
    .insert({ oportunidad_id: oportunidadId, lead_id: leadId, contenido: contenido.trim() })
    .select("id, contenido, created_at, updated_at")
    .single();

  if (error) throw new Error(`[oportunidades] agregarNota: ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.nota_agregada",
    fase: "ok", leadId });
  // Nota escrita = señal de momentum
  void registrarMomentum(leadId, "nota_escrita").catch(() => null);
  return data as OportunidadNota;
}

export async function editarNota(notaId: string, contenido: string): Promise<void> {
  const { error } = await db()
    .from("oportunidades_notas")
    .update({ contenido: contenido.trim() })
    .eq("id", notaId);

  if (error) throw new Error(`[oportunidades] editarNota: ${error.message}`);
}

export async function eliminarNota(notaId: string): Promise<void> {
  const { error } = await db()
    .from("oportunidades_notas")
    .delete()
    .eq("id", notaId);

  if (error) throw new Error(`[oportunidades] eliminarNota: ${error.message}`);
}

export async function obtenerNotasComoTexto(leadId: string): Promise<string> {
  const { data } = await db()
    .from("oportunidades_notas")
    .select("contenido, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data?.length) return "ninguna";

  return (data as { contenido: string; created_at: string }[])
    .map((n) => {
      const fecha = new Date(n.created_at).toLocaleDateString("es-MX", {
        day: "2-digit", month: "short", year: "numeric",
      });
      return `[${fecha}] ${n.contenido}`;
    })
    .join("\n");
}

// ── Panel CRUD ────────────────────────────────────────────────────────────────

export async function actualizarOrden(items: { id: string; posicion: number }[]): Promise<void> {
  await Promise.all(
    items.map(({ id, posicion }) =>
      db().from("oportunidades_panel").update({ posicion }).eq("id", id)
    )
  );
}

export async function removerDelPanel(leadId: string, motivo?: string): Promise<void> {
  const { error } = await db()
    .from("oportunidades_panel")
    .update({ activo: false })
    .eq("lead_id", leadId);

  if (error) throw new Error(`[oportunidades] remover: ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.removido",
    fase: "ok", leadId, resultado: motivo ?? "manual" });
}

export async function agregarAlPanel(leadId: string): Promise<void> {
  // MPS-36: sin hard limit. Upsert: si existía como inactivo, reactiva.
  const { error } = await db()
    .from("oportunidades_panel")
    .upsert({ lead_id: leadId, posicion: 9999, activo: true }, { onConflict: "lead_id" });

  if (error) throw new Error(`[oportunidades] agregar: ${error.message}`);
  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.agregado",
    fase: "ok", leadId });
}

export async function obtenerCandidatos(limit = 40): Promise<CandidatoLead[]> {
  const { data: enPanel } = await db()
    .from("oportunidades_panel")
    .select("lead_id")
    .eq("activo", true);

  const excluidos = (enPanel ?? []).map((r: { lead_id: string }) => r.lead_id);

  let q = db()
    .from("leads")
    .select("id, nombre, telefono, pipeline_stage, score_salud, updated_at, memoria_ia")
    .eq("activo", true)
    .not("pipeline_stage", "in", '("Comprado","Perdido")')
    .order("score_salud", { ascending: false })
    .limit(limit);

  if (excluidos.length > 0) {
    q = q.not("id", "in", `(${excluidos.map((id: string) => `"${id}"`).join(",")})`);
  }

  const { data, error } = await q;
  if (error) throw new Error(`[oportunidades] candidatos: ${error.message}`);
  return (data ?? []) as CandidatoLead[];
}

export async function guardarAnalisisIA(
  leadId: string,
  analisis: {
    resumen_ia: string;
    siguiente_accion_ia: string;
    score_cierre: number;
    razon_score: string;
    ia_sugiere: "ninguna" | "cerrar_ganado" | "cerrar_perdido" | "upsell";
    ia_razon: string | null;
    // MPS-36
    valor_ticket?: number | null;
    fecha_compromiso?: string | null;
    pregunta_clave?: string | null;
  }
): Promise<void> {
  const { error } = await db()
    .from("oportunidades_panel")
    .update({ ...analisis, ultima_ia_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("activo", true);

  if (error) throw new Error(`[oportunidades] guardarAnalisis: ${error.message}`);
}

export async function limpiarSugerenciaIA(leadId: string): Promise<void> {
  const { error } = await db()
    .from("oportunidades_panel")
    .update({ ia_sugiere: "ninguna", ia_razon: null })
    .eq("lead_id", leadId)
    .eq("activo", true);

  if (error) throw new Error(`[oportunidades] limpiarSugerencia: ${error.message}`);
}

// Retrocompatibilidad — ya no hay PANEL_SIZE hard-limit, pero lo exportamos como referencia visual.
export const PANEL_SIZE = 10;
