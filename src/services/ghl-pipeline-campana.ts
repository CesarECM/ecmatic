import { createServiceClient } from "@/lib/supabase/service";
import { buscarContactosPorTag, agregarTagsContacto } from "@/lib/ghl/contacts-api";
import { buscarConversacionWA, obtenerMensajes, inscribirEnWorkflow } from "@/lib/ghl/conversations-api";
import { calificarContactoGHL, formatearHistorialGHL, type CategoriaSBC } from "@/lib/ai/calificar-contacto-ghl";
import { elegirVarianteWorkflow } from "@/services/ab-workflows-ghl";
import { logSistema } from "@/services/log-sistema";

const CAMPANA_ACTIVA = "sbc_jun26";
const TAG_FUENTE     = "ecm_b_caliente";

// Categorías que reciben un workflow (los demás se excluyen o blacklistean)
const CATEGORIAS_ELEGIBLES: CategoriaSBC[] = [
  "ecm_sbc_caliente",
  "ecm_sbc_tibio",
  "ecm_sbc_sin_hist",
];

export interface LoteResultado {
  procesados: number;
  enviados:   number;
  excluidos:  number;
  errores:    number;
  nextPage:   number | null;
  totalGHL:   number;
}

export async function procesarLoteCampana(
  page: number,
  pageLimit = 20
): Promise<LoteResultado> {
  const workflowA = process.env.GHL_WORKFLOW_A_ID ?? "";
  const workflowB = process.env.GHL_WORKFLOW_B_ID ?? "";

  if (!workflowA || !workflowB) {
    throw new Error("GHL_WORKFLOW_A_ID y GHL_WORKFLOW_B_ID deben estar configurados");
  }

  const supabase = createServiceClient();

  // Buscar contactos con tag ecm_b_caliente en GHL
  const { contacts, total } = await buscarContactosPorTag(TAG_FUENTE, page, pageLimit);

  let enviados  = 0;
  let excluidos = 0;
  let errores   = 0;

  for (const contacto of contacts) {
    try {
      // Verificar si ya fue procesado en esta campaña
      const { data: yaLog } = await (supabase as any)
        .from("ghl_campana_logs")
        .select("id, enviado")
        .eq("ghl_contact_id", contacto.id)
        .eq("campana", CAMPANA_ACTIVA)
        .maybeSingle() as { data: { id: string; enviado: boolean } | null };

      if (yaLog?.enviado) {
        excluidos++;
        continue;
      }

      // Leer historial WA del contacto
      let historialTexto = "";
      try {
        const conv = await buscarConversacionWA(contacto.id);
        if (conv) {
          const mensajes = await obtenerMensajes(conv.id, 30);
          historialTexto = formatearHistorialGHL(mensajes);
        }
      } catch {
        // Sin historial — continúa con string vacío → ecm_sbc_sin_hist
      }

      // Clasificar con Haiku
      const { categoria, razon } = await calificarContactoGHL(historialTexto, contacto.id);

      // Aplicar tag SBC en GHL
      await agregarTagsContacto(contacto.id, [categoria]).catch(() => null);

      // Excluir si ya compró o descartó
      if (categoria === "ecm_sbc_ya_compro" || categoria === "ecm_sbc_descartado") {
        const tagExtra = categoria === "ecm_sbc_descartado" ? ["ecm_blacklist"] : [];
        if (tagExtra.length) await agregarTagsContacto(contacto.id, tagExtra).catch(() => null);

        await upsertLog(supabase, {
          ghl_contact_id: contacto.id,
          nombre:        nombreContacto(contacto),
          categoria_sbc: categoria,
          enviado:       false,
          metadata:      { razon },
        });
        excluidos++;
        continue;
      }

      if (!CATEGORIAS_ELEGIBLES.includes(categoria)) {
        excluidos++;
        continue;
      }

      // Thompson Sampling → elegir workflow A o B
      const variante  = await elegirVarianteWorkflow(CAMPANA_ACTIVA);
      const workflowId = variante === "a" ? workflowA : workflowB;

      // Inscribir en workflow (GHL envía el template automáticamente)
      await inscribirEnWorkflow(contacto.id, workflowId);

      await upsertLog(supabase, {
        ghl_contact_id: contacto.id,
        nombre:        nombreContacto(contacto),
        categoria_sbc: categoria,
        workflow_id:   workflowId,
        variante,
        enviado:       true,
        enviado_at:    new Date().toISOString(),
        metadata:      { razon },
      });

      enviados++;

      // Rate limit: 1 contacto cada 2 s para no saturar GHL
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

  const totalPaginas = Math.ceil(total / pageLimit);
  const nextPage     = page < totalPaginas ? page + 1 : null;

  return {
    procesados: contacts.length,
    enviados,
    excluidos,
    errores,
    nextPage,
    totalGHL: total,
  };
}

async function upsertLog(
  supabase: ReturnType<typeof createServiceClient>,
  data: {
    ghl_contact_id: string;
    nombre?: string;
    categoria_sbc: string;
    workflow_id?: string;
    variante?: "a" | "b";
    enviado: boolean;
    enviado_at?: string;
    metadata?: Record<string, unknown>;
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
