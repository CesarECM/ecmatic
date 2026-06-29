// GHL-9.7 — Detecta leads en silencio y crea registros seguimiento_lead.
// Caso A: lead respondió a template GHL pero lleva >4h mudo.
// Caso B: cualquier lead del funnel (GHL u orgánico) que se silenció.
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { crearSeguimiento } from "@/services/seguimiento-lead";
import { buscarConversacionWA } from "@/lib/ghl/conversations-api";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const SILENCIO_HORAS = 4;

interface LeadSilencioso {
  id: string;
  telefono: string;
  nombre: string | null;
  canal_origen: string | null;
  last_entrante: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

// Caso A: leads de campaña GHL con respuesta positiva que se silenciaron >4h
async function detectarSilencioGHL(): Promise<number> {
  const corte = new Date(Date.now() - SILENCIO_HORAS * 3600 * 1000).toISOString();

  // Leads en campaña que respondieron positivo
  const { data: logs } = await db()
    .from("ghl_campana_logs")
    .select("ghl_contact_id, campana")
    .eq("campana", CAMPANA_ACTIVA)
    .eq("respuesta_tipo", "positivo") as { data: Array<{ ghl_contact_id: string; campana: string }> | null };

  if (!logs?.length) return 0;

  let creados = 0;

  for (const log of logs) {
    const telefono = `ghl_${log.ghl_contact_id}`;

    // Buscar el lead en ECMatic
    const { data: lead } = await db()
      .from("leads")
      .select("id, nombre")
      .eq("telefono", telefono)
      .maybeSingle() as { data: { id: string; nombre: string | null } | null };

    if (!lead) continue;

    // Verificar si el último mensaje entrante fue hace >4h
    const { data: ultimoEntrante } = await db()
      .from("mensajes")
      .select("created_at")
      .eq("lead_id", lead.id)
      .eq("direccion", "entrante")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { created_at: string } | null };

    if (!ultimoEntrante || ultimoEntrante.created_at > corte) continue;

    // Verificar que no enviamos nada después de ese mensaje
    const { data: ultimoSaliente } = await db()
      .from("mensajes")
      .select("created_at")
      .eq("lead_id", lead.id)
      .eq("direccion", "saliente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { created_at: string } | null };

    if (ultimoSaliente && ultimoSaliente.created_at >= ultimoEntrante.created_at) continue;

    // Obtener conv_id de GHL para poder enviar el mensaje después
    const conv = await buscarConversacionWA(log.ghl_contact_id).catch(() => null);

    const id = await crearSeguimiento({
      leadId:       lead.id,
      tipo:         "conversational",
      ghlContactId: log.ghl_contact_id,
      convId:       conv?.id ?? null,
      campana:      CAMPANA_ACTIVA,
    });

    if (id) creados++;
  }

  return creados;
}

// Caso B: cualquier lead del funnel que lleva >4h sin respuesta (sin importar canal)
async function detectarSilencioFunnel(): Promise<number> {
  const corte = new Date(Date.now() - SILENCIO_HORAS * 3600 * 1000).toISOString();

  // Leads no archivados con al menos un mensaje entrante viejo
  const { data: leads } = await db()
    .rpc("leads_silenciosos", { corte_at: corte }) as { data: LeadSilencioso[] | null };

  // Fallback si el RPC no existe: query inline
  const candidatos: LeadSilencioso[] = leads ?? await detectarSilencioFallback(corte);

  if (!candidatos.length) return 0;

  let creados = 0;

  for (const lead of candidatos) {
    const esGHL = lead.telefono.startsWith("ghl_");
    const ghlContactId = esGHL ? lead.telefono.replace("ghl_", "") : null;

    // Para GHL: obtener conv_id
    let convId: string | null = null;
    if (ghlContactId) {
      const conv = await buscarConversacionWA(ghlContactId).catch(() => null);
      convId = conv?.id ?? null;
    }

    const id = await crearSeguimiento({
      leadId:       lead.id,
      tipo:         "nurturing",
      ghlContactId: ghlContactId,
      convId:       convId,
      campana:      esGHL ? CAMPANA_ACTIVA : null,
    });

    if (id) creados++;
  }

  return creados;
}

// Fallback de query inline cuando el RPC no está disponible
async function detectarSilencioFallback(corte: string): Promise<LeadSilencioso[]> {
  // Obtiene leads con último mensaje entrante > 4h y sin saliente posterior
  // Excluye leads ya archivados (is_test = false como proxy; ajustar según schema real)
  const { data } = await db()
    .from("leads")
    .select("id, telefono, nombre, canal_origen")
    .eq("archivado", false)
    .limit(500) as { data: Array<{ id: string; telefono: string; nombre: string | null; canal_origen: string | null }> | null };

  if (!data?.length) return [];

  const resultado: LeadSilencioso[] = [];

  for (const lead of data) {
    const { data: ult } = await db()
      .from("mensajes")
      .select("created_at, direccion")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(2) as { data: Array<{ created_at: string; direccion: string }> | null };

    if (!ult?.length) continue;

    const ultimo = ult[0];
    // El último mensaje debe ser entrante y anterior al corte
    if (ultimo.direccion !== "entrante") continue;
    if (ultimo.created_at >= corte) continue;

    resultado.push({ ...lead, last_entrante: ultimo.created_at });
  }

  return resultado;
}

// Punto de entrada del cron — ejecuta ambos detectores
export async function detectarSilencios(): Promise<{ silencio_ghl: number; silencio_funnel: number }> {
  const traceId = crypto.randomUUID();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.detectar-silencio", fase: "inicio", traceId,
    resultado: "Escaneando leads silenciosos",
  });

  const [silencio_ghl, silencio_funnel] = await Promise.all([
    detectarSilencioGHL().catch((e) => {
      void logSistema({ categoria: "cron", tipoAccion: "cron.detectar-silencio", fase: "error", traceId, resultado: `GHL: ${e}` });
      return 0;
    }),
    detectarSilencioFunnel().catch((e) => {
      void logSistema({ categoria: "cron", tipoAccion: "cron.detectar-silencio", fase: "error", traceId, resultado: `Funnel: ${e}` });
      return 0;
    }),
  ]);

  void logSistema({
    categoria: "cron", tipoAccion: "cron.detectar-silencio", fase: "ok", traceId,
    resultado: `ghl:${silencio_ghl} funnel:${silencio_funnel}`,
    metadata:  { silencio_ghl, silencio_funnel },
  });

  return { silencio_ghl: silencio_ghl, silencio_funnel: silencio_funnel };
}
