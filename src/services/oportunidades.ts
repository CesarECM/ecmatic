// MPS-34/35 — CRUD del panel de oportunidades de cierre.
// Mantiene exactamente 10 leads activos en oportunidades_panel.
// Las notas por lead se almacenan en oportunidades_notas (historial CRUD).

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

const PANEL_SIZE = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function listarOportunidades(): Promise<OportunidadRow[]> {
  const { data, error } = await db()
    .from("oportunidades_panel")
    .select(`
      id, lead_id, posicion, notas_admin, resumen_ia, siguiente_accion_ia,
      score_cierre, razon_score, ia_sugiere, ia_razon, activo, ultima_ia_at,
      oportunidades_notas(id, contenido, created_at, updated_at),
      leads(nombre, telefono, email, pipeline_stage, pipeline_ruta, score_salud,
            temperamento_inferido, ghl_contact_id, updated_at)
    `)
    .eq("activo", true)
    .order("posicion", { ascending: true })
    .limit(PANEL_SIZE);

  if (error) throw new Error(`[oportunidades] listar: ${error.message}`);

  // Notas: más reciente primero
  return ((data ?? []) as OportunidadRow[]).map((row) => ({
    ...row,
    oportunidades_notas: [...(row.oportunidades_notas ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  }));
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

// Devuelve las notas formateadas para incluir en el prompt de la IA.
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
  const count = await contarOportunidadesActivas();
  if (count >= PANEL_SIZE) throw new Error("Panel lleno (10/10)");

  const { error } = await db()
    .from("oportunidades_panel")
    .upsert({ lead_id: leadId, posicion: count, activo: true }, { onConflict: "lead_id" });

  if (error) throw new Error(`[oportunidades] agregar: ${error.message}`);

  void logSistema({ categoria: "ui", tipoAccion: "oportunidades.agregado",
    fase: "ok", leadId });
}

export async function obtenerCandidatos(limit = 30): Promise<CandidatoLead[]> {
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

export { PANEL_SIZE };
