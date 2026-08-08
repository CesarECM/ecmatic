"use server";

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarOCrearContactoGHL } from "@/lib/ghl/contacts-api";
import { agregarAlPanel } from "@/services/oportunidades";
import { logSistema } from "@/services/log-sistema";
import type { OportunidadRow } from "@/services/oportunidades";

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

function normalizarTel(raw: string): string | null {
  const limpio = raw.replace(/\D/g, "");
  return limpio.length >= 10 ? limpio : null;
}

export type CrearLeadResultado =
  | { ok: true; duplicado: false; op: OportunidadRow }
  | { ok: true; duplicado: true; leadId: string; op: OportunidadRow | null }
  | { ok: false; error: string };

export async function crearNuevoLeadWorkspaceAction(
  telefono: string,
  nombre: string | null,
): Promise<CrearLeadResultado> {
  const tel = normalizarTel(telefono);
  if (!tel) return { ok: false, error: "Teléfono inválido (mínimo 10 dígitos)" };

  // 1. Buscar duplicado por teléfono
  const { data: existente } = await db()
    .from("leads")
    .select("id")
    .eq("telefono", tel)
    .maybeSingle();

  if (existente) {
    const { data: opExistente } = await db()
      .from("oportunidades_panel")
      .select(SELECT_FIELDS)
      .eq("lead_id", existente.id)
      .eq("activo", true)
      .maybeSingle();
    return {
      ok: true,
      duplicado: true,
      leadId: existente.id as string,
      op: (opExistente as OportunidadRow) ?? null,
    };
  }

  // 2. Crear lead
  const { data: nuevo, error: errIns } = await db()
    .from("leads")
    .insert({ telefono: tel, nombre: nombre || null, canal_origen: "admin", activo: true })
    .select("id")
    .single();

  if (errIns || !nuevo) {
    void logSistema({
      categoria: "ui",
      tipoAccion: "workspace.nuevo_lead",
      fase: "error",
      resultado: errIns?.message ?? "insert failed",
    });
    return { ok: false, error: "Error al crear el lead" };
  }

  const leadId = nuevo.id as string;

  // 3. Agregar al panel de oportunidades
  try {
    await agregarAlPanel(leadId);
  } catch (err) {
    void logSistema({
      categoria: "ui",
      tipoAccion: "workspace.nuevo_lead",
      fase: "error",
      leadId,
      resultado: err instanceof Error ? err.message : "agregarAlPanel falló",
    });
    return { ok: false, error: "Lead creado pero no se pudo agregar al panel" };
  }

  // 4. Post-respuesta: sync GHL + análisis IA (no bloquea al usuario)
  after(async () => {
    const ghlId = await buscarOCrearContactoGHL(tel, nombre).catch(() => null);
    if (ghlId) {
      void db().from("leads").update({ ghl_contact_id: ghlId }).eq("id", leadId);
    }
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/oportunidades/analizar-uno`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ leadId }),
    }).catch(() => null);
  });

  // 5. Recuperar OportunidadRow recién creada (sin análisis aún)
  const { data: op } = await db()
    .from("oportunidades_panel")
    .select(SELECT_FIELDS)
    .eq("lead_id", leadId)
    .eq("activo", true)
    .maybeSingle();

  if (!op) return { ok: false, error: "Lead creado pero no se pudo recuperar del panel" };

  void logSistema({
    categoria: "ui",
    tipoAccion: "workspace.nuevo_lead",
    fase: "ok",
    leadId,
    resultado: nombre ?? tel,
  });

  return { ok: true, duplicado: false, op: op as OportunidadRow };
}
