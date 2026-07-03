import { createServiceClient } from "@/lib/supabase/service";
import { buscarContactosPorTag, agregarTagsContacto } from "@/lib/ghl/contacts-api";
import { buscarConversacionWA, obtenerMensajes, inscribirEnWorkflow } from "@/lib/ghl/conversations-api";
import { calificarContactoGHL, formatearHistorialGHL, type CategoriaSBC } from "@/lib/ai/calificar-contacto-ghl";
import { elegirVarianteWorkflow } from "@/services/ab-workflows-ghl";
import { logSistema } from "@/services/log-sistema";

const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
const TAG_FUENTE     = process.env.GHL_TAG_FUENTE    ?? "ecm_b_caliente";

// Categorías que reciben un workflow (los demás se excluyen o blacklistean)
const CATEGORIAS_ELEGIBLES: CategoriaSBC[] = [
  "ecm_sbc_caliente",
  "ecm_sbc_tibio",
  "ecm_sbc_sin_hist",
];

// GHL fetch size: desacoplado del lote a enviar.
// Cuántos contactos traer por llamada a la API de GHL (máximo recomendado = 100).
const GHL_FETCH_SIZE = 100;

// Presupuesto de tiempo por run del cron (maxDuration=300s — dejamos 60s de margen).
const MAX_MS = 240_000;

export interface LoteResultado {
  procesados: number;
  enviados:   number;
  excluidos:  number;
  errores:    number;
  nextPage:   number | null;
  totalGHL:   number;
}

// Recorre páginas de GHL hasta enviar maxEnvios leads elegibles o agotar el tiempo/pool.
// Cada página trae GHL_FETCH_SIZE contactos; el check de yaLog se hace en batch (1 query por página).
export async function procesarLoteCampana(
  paginaInicial: number,
  maxEnvios: number,
): Promise<LoteResultado> {
  const workflowA = process.env.GHL_WORKFLOW_A_ID ?? "";
  const workflowB = process.env.GHL_WORKFLOW_B_ID ?? "";
  if (!workflowA || !workflowB) {
    throw new Error("GHL_WORKFLOW_A_ID y GHL_WORKFLOW_B_ID deben estar configurados");
  }

  const supabase     = createServiceClient();
  const umbral7dias  = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const iniciadoEn   = Date.now();

  let enviados  = 0;
  let excluidos = 0;
  let errores   = 0;
  let procesados = 0;
  let nextPage: number | null = null;
  let totalGHL = 0;
  let page = paginaInicial;

  while (enviados < maxEnvios) {
    // Presupuesto de tiempo para no exceder maxDuration de Vercel
    if (Date.now() - iniciadoEn > MAX_MS) break;

    const { contacts, total } = await buscarContactosPorTag(TAG_FUENTE, page, GHL_FETCH_SIZE);
    totalGHL = total;

    if (contacts.length === 0) { nextPage = null; break; }

    // Batch check: un solo SELECT IN en lugar de N queries secuenciales
    const ids = contacts.map((c) => c.id);
    const { data: logsExistentes } = await (supabase as any)
      .from("ghl_campana_logs")
      .select("ghl_contact_id, enviado")
      .eq("campana", CAMPANA_ACTIVA)
      .in("ghl_contact_id", ids) as { data: { ghl_contact_id: string; enviado: boolean }[] | null };
    const yaEnviadoMap = new Map((logsExistentes ?? []).map((l) => [l.ghl_contact_id, l.enviado]));

    for (const contacto of contacts) {
      if (enviados >= maxEnvios) break;
      procesados++;

      try {
        // Fast path — sin IA ni GHL API (microsegundos)
        if (contacto.dateAdded && new Date(contacto.dateAdded).getTime() > umbral7dias) {
          void agregarTagsContacto(contacto.id, ["est_nuevo"]).catch(() => null);
          excluidos++;
          continue;
        }

        if (yaEnviadoMap.get(contacto.id) === true) {
          excluidos++;
          continue;
        }

        // Slow path — historial WA + Haiku + workflow
        let historialTexto = "";
        try {
          const conv = await buscarConversacionWA(contacto.id);
          if (conv) {
            const mensajes = await obtenerMensajes(conv.id, 30);
            historialTexto = formatearHistorialGHL(mensajes);
          }
        } catch { /* sin historial → ecm_sbc_sin_hist */ }

        const { categoria, razon } = await calificarContactoGHL(historialTexto, contacto.id);
        void agregarTagsContacto(contacto.id, [categoria]).catch(() => null);

        if (categoria === "ecm_sbc_ya_compro" || categoria === "ecm_sbc_descartado") {
          if (categoria === "ecm_sbc_descartado") {
            void agregarTagsContacto(contacto.id, ["ecm_blacklist"]).catch(() => null);
          }
          await upsertLog(supabase, {
            ghl_contact_id: contacto.id,
            nombre:         nombreContacto(contacto),
            categoria_sbc:  categoria,
            enviado:        false,
            metadata:       { razon },
          });
          excluidos++;
          continue;
        }

        if (!CATEGORIAS_ELEGIBLES.includes(categoria)) {
          excluidos++;
          continue;
        }

        const variante   = await elegirVarianteWorkflow(CAMPANA_ACTIVA);
        const workflowId = variante === "a" ? workflowA : workflowB;

        await (supabase as any).from("leads").upsert(
          {
            telefono:            `ghl_${contacto.id}`,
            canal_origen:        "whatsapp",
            privacidad_aceptada: true,
            nombre:              nombreContacto(contacto),
          },
          { onConflict: "telefono" }
        );

        await inscribirEnWorkflow(contacto.id, workflowId);

        await upsertLog(supabase, {
          ghl_contact_id: contacto.id,
          nombre:         nombreContacto(contacto),
          categoria_sbc:  categoria,
          workflow_id:    workflowId,
          variante,
          enviado:        true,
          enviado_at:     new Date().toISOString(),
          metadata:       { razon },
        });

        enviados++;
        await delay(2000);
      } catch (err) {
        errores++;
        void logSistema({
          categoria:  "servicio",
          tipoAccion: "ghl_campana.error",
          fase:       "error",
          resultado:  err instanceof Error ? err.message.slice(0, 200) : "Error",
          metadata:   { ghl_contact_id: contacto.id, campana: CAMPANA_ACTIVA },
        });
      }
    }

    // Calcular siguiente página con el tamaño de fetch real
    const totalPaginas = Math.ceil(total / GHL_FETCH_SIZE);
    nextPage = page < totalPaginas ? page + 1 : null;

    if (enviados >= maxEnvios || nextPage === null) break;
    page = nextPage; // seguir al siguiente bloque de GHL_FETCH_SIZE contactos
  }

  return { procesados, enviados, excluidos, errores, nextPage, totalGHL };
}

async function upsertLog(
  supabase: ReturnType<typeof createServiceClient>,
  data: {
    ghl_contact_id: string;
    nombre?:        string;
    categoria_sbc:  string;
    workflow_id?:   string;
    variante?:      "a" | "b";
    enviado:        boolean;
    enviado_at?:    string;
    metadata?:      Record<string, unknown>;
  }
): Promise<void> {
  await (supabase as any)
    .from("ghl_campana_logs")
    .upsert(
      { campana: CAMPANA_ACTIVA, ...data },
      { onConflict: "ghl_contact_id,campana", ignoreDuplicates: false }
    );
}

function nombreContacto(c: { firstName?: string; lastName?: string; name?: string }): string {
  return c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ") ?? "Sin nombre";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
