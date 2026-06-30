// MPS-13 S51 — Re-clasificador de cobertura de seguimiento.
// Detecta leads con actividad reciente pero sin seguimiento activo,
// usa Haiku para leer la conversación y asigna el tipo correcto.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { obtenerHistorial } from "@/services/mensajes";
import { clasificarCobertura, type ClasificacionCobertura } from "@/lib/ai/clasificar-cobertura";
import { crearSeguimiento } from "@/services/seguimiento-lead";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

interface LeadSinCobertura {
  id: string;
  nombre: string | null;
  telefono: string | null;
}

async function obtenerLeadsSinCobertura(limite: number): Promise<LeadSinCobertura[]> {
  const hace30 = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();

  // Paso 1: lead_ids con actividad reciente
  const { data: conActividad } = await db()
    .from("mensajes")
    .select("lead_id")
    .gte("created_at", hace30) as { data: Array<{ lead_id: string }> | null };

  if (!conActividad?.length) return [];

  const idsConActividad = [...new Set(conActividad.map((r) => r.lead_id))];

  // Paso 2: lead_ids que ya tienen seguimiento activo
  const { data: conSeguimiento } = await db()
    .from("seguimiento_lead")
    .select("lead_id")
    .eq("estado", "activo")
    .in("lead_id", idsConActividad) as { data: Array<{ lead_id: string }> | null };

  const conCoberturaSet = new Set((conSeguimiento ?? []).map((r) => r.lead_id));

  const sinCobertura = idsConActividad
    .filter((id) => !conCoberturaSet.has(id))
    .slice(0, limite);

  if (!sinCobertura.length) return [];

  // Paso 3: datos del lead
  const { data: leads } = await db()
    .from("leads")
    .select("id, nombre, telefono")
    .in("id", sinCobertura)
    .eq("archivado", false) as { data: LeadSinCobertura[] | null };

  return leads ?? [];
}

// Para leads GHL su telefono es "ghl_<contactId>" — extraemos el contactId directamente.
function resolverGhlContactId(telefono: string | null): string | null {
  if (telefono?.startsWith("ghl_")) return telefono.slice(4);
  return null;
}

export interface ResultadoReclasificacion {
  procesados: number;
  creados: number;
  omitidos: number;
  por_tipo: Record<ClasificacionCobertura, number>;
}

export async function reclasificarCobertura(limite = 200): Promise<ResultadoReclasificacion> {
  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  const resultado: ResultadoReclasificacion = {
    procesados: 0,
    creados: 0,
    omitidos: 0,
    por_tipo: { nurturing: 0, conversational: 0, demo_agendado: 0, payment: 0, cerrado: 0 },
  };

  void logSistema({
    categoria: "servicio", tipoAccion: "reclasificar_cobertura", fase: "inicio", traceId,
    resultado: `Iniciando — límite:${limite}`,
  });

  const leads = await obtenerLeadsSinCobertura(limite);
  resultado.procesados = leads.length;

  for (const lead of leads) {
    const historial = await obtenerHistorial(lead.id, 10).catch(() => "");

    if (!historial) {
      resultado.omitidos++;
      continue;
    }

    const tipo = await clasificarCobertura(historial, { leadId: lead.id, traceId });
    resultado.por_tipo[tipo]++;

    if (tipo === "cerrado") {
      resultado.omitidos++;
      continue;
    }

    const ghlContactId = resolverGhlContactId(lead.telefono);

    const id = await crearSeguimiento({
      leadId: lead.id,
      tipo,
      ghlContactId,
      campana: CAMPANA_ACTIVA,
    });

    if (id) {
      resultado.creados++;
    } else {
      resultado.omitidos++;
    }
  }

  void logSistema({
    categoria: "servicio", tipoAccion: "reclasificar_cobertura", fase: "ok", traceId,
    resultado: `procesados:${resultado.procesados} creados:${resultado.creados} omitidos:${resultado.omitidos}`,
    metadata:  { ...resultado, duracion_ms: Date.now() - inicio },
  });

  return resultado;
}
