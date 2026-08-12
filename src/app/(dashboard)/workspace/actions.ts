"use server";

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { V2AccionKbx, V2BusquedaResultado, V2OpportunityNote } from "@/lib/supabase/types.v2";
import { listarOportunidades } from "@/services/v2/oportunidades";
import { generarYGuardarEmbedding } from "@/services/v2/kb-search";
import { listarTareas } from "@/services/v2/tareas";
import { analizarOportunidad } from "@/services/v2/loop-analizar";
import { generarContenido } from "@/services/v2/loop-generar";
import { aprobarContactPoint, editarContactPoint, rechazarContactPoint } from "@/services/v2/loop-aprobar";
import { proponerKbDesdeRetroalimentacion } from "@/services/v2/loop-kb-proponer";
import { enviarPorGHL, marcarEnviadoManual } from "@/services/v2/loop-enviar";

export async function listarOportunidadesAction() {
  return listarOportunidades();
}

export async function listarTareasAction() {
  return listarTareas();
}

export async function analizarOportunidadAction(opId: string) {
  return analizarOportunidad(opId);
}

export async function generarContenidoAction(cpId: string, instruccion?: string) {
  return generarContenido(cpId, instruccion);
}

export async function aprobarContactPointAction(cpId: string) {
  return aprobarContactPoint(cpId);
}

// Paso 10: edición dispara propuesta KB en background (no bloquea al usuario)
export async function editarContactPointAction(
  cpId: string,
  contenidoFinal: string,
  retroalimentacion: string,
) {
  await editarContactPoint(cpId, contenidoFinal, retroalimentacion);
  after(async () => {
    await proponerKbDesdeRetroalimentacion(cpId).catch(() => {});
  });
}

// Paso 10: rechazo dispara propuesta KB en background
export async function rechazarContactPointAction(cpId: string, retroalimentacion: string) {
  await rechazarContactPoint(cpId, retroalimentacion);
  after(async () => {
    await proponerKbDesdeRetroalimentacion(cpId).catch(() => {});
  });
}

// ── Envío S148.4 ─────────────────────────────────────────────────────────────

export async function enviarPorGHLAction(cpId: string) {
  return enviarPorGHL(cpId);
}

export async function marcarEnviadoManualAction(cpId: string) {
  return marcarEnviadoManual(cpId);
}

// ── Acciones de revisión de items KB propuestos ───────────────────────────────

export async function aprobarKbItemAction(id: string) {
  const db = createServiceClient() as any;
  const { error } = await db.from("v2_kb_items").update({
    estado:            "aprobado",
    ultima_validacion: new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`aprobarKbItem: ${error.message}`);
  after(async () => { await generarYGuardarEmbedding(id).catch(() => {}); });
}

export async function rechazarKbItemAction(id: string) {
  const db = createServiceClient() as any;
  const { error } = await db.from("v2_kb_items").update({
    estado:     "rechazado",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`rechazarKbItem: ${error.message}`);
}

export async function editarKbItemAction(id: string, contenido: string) {
  if (!contenido.trim()) throw new Error("El contenido no puede estar vacío");
  const db = createServiceClient() as any;
  const { error } = await db.from("v2_kb_items").update({
    contenido:         contenido.trim(),
    estado:            "aprobado",
    ultima_validacion: new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`editarKbItem: ${error.message}`);
  after(async () => { await generarYGuardarEmbedding(id).catch(() => {}); });
}

// ── Notas de oportunidad S146.3 ───────────────────────────────────────────────

export async function listarNotasAction(
  opId: string,
): Promise<Pick<V2OpportunityNote, "id" | "contenido" | "created_at">[]> {
  const db = createServiceClient() as any;
  const { data, error } = await db
    .from("v2_opportunity_notes")
    .select("id, contenido, created_at")
    .eq("opportunity_id", opId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listarNotas: ${error.message}`);
  return data ?? [];
}

// ── S152.1 — Nueva oportunidad manual para lead existente ────────────────────

export async function crearOportunidadAction(leadId: string): Promise<void> {
  const db = createServiceClient() as any;
  const { data: nueva, error } = await db
    .from("v2_opportunities")
    .insert({ lead_id: leadId, fase_cagc: "conciencia", estado: "activa" })
    .select("id")
    .single();
  if (error || !nueva) throw new Error(`crearOportunidad: ${error?.message}`);
  after(async () => { await analizarOportunidad(nueva.id).catch(() => {}); });
}

// ── S152.3 — Marcar oportunidad con estado terminal ───────────────────────────

export async function marcarEstadoOpAction(
  opId:   string,
  estado: "GANADA" | "PERDIDA" | "INACTIVA" | "LISTA_NEGRA",
): Promise<void> {
  const db    = createServiceClient() as any;
  const ahora = new Date().toISOString();

  const { data: op, error } = await db
    .from("v2_opportunities")
    .update({ estado, updated_at: ahora })
    .eq("id", opId)
    .select("lead_id")
    .single();
  if (error) throw new Error(`marcarEstadoOp: ${error.message}`);

  // LISTA_NEGRA se propaga al lead
  if (estado === "LISTA_NEGRA" && op?.lead_id) {
    await db.from("v2_leads")
      .update({ estado: "LISTA_NEGRA", updated_at: ahora })
      .eq("id", op.lead_id);
  }

  // Cancelar contact_points que son exclusivos de esta oportunidad (no fusionados)
  if (op?.lead_id) {
    const { data: cps } = await db
      .from("v2_contact_points")
      .select("id, opportunity_ids")
      .eq("lead_id", op.lead_id)
      .in("estado", ["pendiente_generacion", "generado"]);

    const exclusivos = ((cps ?? []) as { id: string; opportunity_ids: string[] }[])
      .filter((cp) => cp.opportunity_ids.length === 1 && cp.opportunity_ids[0] === opId)
      .map((cp) => cp.id);

    if (exclusivos.length > 0) {
      await db.from("v2_contact_points").delete().in("id", exclusivos);
    }
  }
}

// ── Acciones de mantenimiento KBX (S150.4) ───────────────────────────────────

export async function aprobarKbxItemAction(
  id:         string,
  accion:     V2AccionKbx,
  kbItemIds:  string[],
) {
  const db   = createServiceClient() as any;
  const ahora = new Date().toISOString();

  if (accion === "eliminar" || accion === "marcar_obsoleto") {
    for (const kbId of kbItemIds) {
      await db.from("v2_kb_items").update({ estado: "rechazado", updated_at: ahora }).eq("id", kbId);
    }
  } else if (accion === "unir") {
    // Conservar el primero (mayor score); rechazar el resto
    for (const kbId of kbItemIds.slice(1)) {
      await db.from("v2_kb_items").update({ estado: "rechazado", updated_at: ahora }).eq("id", kbId);
    }
  }
  // "separar": sin acción automática — el admin lo hace manualmente

  const { error } = await db.from("v2_kbx_review_queue").update({
    estado:     "aprobado",
    updated_at: ahora,
  }).eq("id", id);
  if (error) throw new Error(`aprobarKbxItem: ${error.message}`);
}

export async function rechazarKbxItemAction(id: string) {
  const db = createServiceClient() as any;
  const { error } = await db.from("v2_kbx_review_queue").update({
    estado:     "rechazado",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`rechazarKbxItem: ${error.message}`);
}

// ── Búsqueda de leads S151.3 ──────────────────────────────────────────────────

export async function buscarLeadsAction(query: string): Promise<V2BusquedaResultado[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const db = createServiceClient() as any;

  const { data: leads, error } = await db
    .from("v2_leads")
    .select("id, nombre, telefono, email, estado")
    .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
    .neq("estado", "LISTA_NEGRA")
    .limit(10);

  if (error || !leads?.length) return [];

  const leadIds = (leads as { id: string }[]).map((l) => l.id);

  const { data: ops } = await db
    .from("v2_opportunities")
    .select("id, lead_id, producto_servicio, fase_cagc, score_combinado")
    .in("lead_id", leadIds)
    .eq("estado", "activa")
    .order("score_combinado", { ascending: false });

  type RawOp = { id: string; lead_id: string; producto_servicio: string | null; fase_cagc: string; score_combinado: number };
  const opsByLead = new Map<string, V2BusquedaResultado["oportunidades"]>();
  for (const op of (ops ?? []) as RawOp[]) {
    if (!opsByLead.has(op.lead_id)) opsByLead.set(op.lead_id, []);
    opsByLead.get(op.lead_id)!.push({
      id:               op.id,
      producto_servicio: op.producto_servicio,
      fase_cagc:        op.fase_cagc as V2BusquedaResultado["oportunidades"][0]["fase_cagc"],
      score_combinado:  op.score_combinado,
    });
  }

  return (leads as { id: string; nombre: string | null; telefono: string | null; email: string | null; estado: string }[]).map((l) => ({
    id:            l.id,
    nombre:        l.nombre,
    telefono:      l.telefono,
    email:         l.email,
    estado:        l.estado as V2BusquedaResultado["estado"],
    oportunidades: opsByLead.get(l.id) ?? [],
  }));
}

export async function agregarNotaAction(opId: string, contenido: string) {
  if (!contenido.trim()) throw new Error("La nota no puede estar vacía");
  const db = createServiceClient() as any;
  const { error } = await db.from("v2_opportunity_notes").insert({
    opportunity_id: opId,
    contenido:      contenido.trim(),
    autor:          null,
  });
  if (error) throw new Error(`agregarNota: ${error.message}`);
  after(async () => {
    await analizarOportunidad(opId).catch(() => {});
  });
}
