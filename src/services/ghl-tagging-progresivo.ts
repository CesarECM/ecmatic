import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import { obtenerContacto, agregarTagsContacto, eliminarTagsContacto } from "@/lib/ghl/contacts-api";
import { upsertOportunidadGHL } from "@/lib/ghl/opportunities-api";
import { determinarTagsGHL } from "@/lib/ai/determinar-tags-ghl";

interface GHLPipelineConfig {
  pipeline_id: string;
  stages: Record<string, string>;
}

async function leerConfigPipeline(): Promise<GHLPipelineConfig | null> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("configuracion_sistema")
    .select("metadata")
    .limit(1)
    .single() as { data: { metadata?: { ghl_pipeline?: GHLPipelineConfig } } | null };
  return data?.metadata?.ghl_pipeline ?? null;
}

// Determina tags y etapa de pipeline para un mensaje positivo entrante
// y los aplica en GHL de forma no bloqueante.
export async function actualizarTagsYPipeline(
  contactId: string,
  mensajeLead: string,
  intencion: string,
  nombreContacto?: string | null
): Promise<void> {
  const [config, contacto] = await Promise.all([
    leerConfigPipeline().catch(() => null),
    obtenerContacto(contactId).catch(() => null),
  ]);

  if (!config) {
    void logSistema({
      categoria: "servicio", tipoAccion: "ghl_tagging.config",
      fase: "error", resultado: "Sin config de pipeline en configuracion_sistema",
      metadata: { contactId },
    });
    return;
  }

  const tagsActuales = contacto?.tags ?? [];

  const decision = await determinarTagsGHL({
    mensajeLead,
    intencion,
    tagsActuales,
    contactId,
  }).catch(() => null);

  if (!decision) return;

  void logSistema({
    categoria: "servicio", tipoAccion: "ghl_tagging.decision", fase: "ok",
    resultado: decision.razon,
    metadata: {
      contactId,
      tagsAgregar: decision.tagsAgregar,
      tagsRemover: decision.tagsRemover,
      stageKey: decision.stageKey,
    },
  });

  await Promise.all([
    decision.tagsAgregar.length
      ? agregarTagsContacto(contactId, decision.tagsAgregar).catch(() => null)
      : Promise.resolve(),
    decision.tagsRemover.length
      ? eliminarTagsContacto(contactId, decision.tagsRemover).catch(() => null)
      : Promise.resolve(),
  ]);

  if (decision.stageKey) {
    const stageId = config.stages[decision.stageKey];
    if (!stageId) return;

    await upsertOportunidadGHL(
      contactId,
      config.pipeline_id,
      stageId,
      nombreContacto ?? undefined
    ).catch(() => null);

    void logSistema({
      categoria: "servicio", tipoAccion: "ghl_tagging.pipeline", fase: "ok",
      resultado: `stage:${decision.stageKey}`,
      metadata: { contactId, stageKey: decision.stageKey, stageId },
    });
  }
}
