// S23.1 — Servicio de gestión del campo Contexto del lead
import { createServiceClient } from "@/lib/supabase/service";
import { generarActualizacionContexto, generarSubresumenContexto } from "@/lib/ai/contexto-ia";
import type { EntradaContexto } from "@/lib/supabase/types";
import { randomUUID } from "crypto";

// Número de versiones en historial antes de comprimir (S23.4)
const UMBRAL_COMPRESION = 10;

// S23.3 — Actualiza el Contexto del lead con una nueva entrada de IA
// Llamar fire-and-forget desde conversacion.ts y otros servicios
export async function actualizarContextoIA(leadId: string, accion: string): Promise<void> {
  const supabase = createServiceClient();

  const [{ data: lead }, { data: cagc }, { data: etiquetasRaw }] = await Promise.all([
    supabase
      .from("leads")
      .select("nombre, pipeline_stage, contexto, contexto_historial")
      .eq("id", leadId)
      .single(),
    supabase.from("lead_cagc_estado").select("fase_numero").eq("lead_id", leadId).maybeSingle(),
    supabase
      .from("lead_etiquetas")
      .select("etiquetas(nombre, etiqueta_categorias(nombre))")
      .eq("lead_id", leadId),
  ]);

  if (!lead) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const etiquetas = (etiquetasRaw ?? []).map((le: any) =>
    `${le.etiquetas?.etiqueta_categorias?.nombre ?? ""}:${le.etiquetas?.nombre ?? ""}`
  );

  const nuevoTexto = await generarActualizacionContexto(
    lead.contexto ?? null,
    accion,
    { nombre: lead.nombre, pipeline_stage: lead.pipeline_stage, fase_cagc: cagc?.fase_numero, etiquetas }
  );

  await guardarContexto(leadId, nuevoTexto, lead.contexto, lead.contexto_historial as EntradaContexto[], "ia", accion);
}

// S23.2 — Agrega una entrada manual humana al Contexto
export async function agregarEntradaManualContexto(
  leadId: string,
  nota: string,
  autor: string
): Promise<void> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("nombre, pipeline_stage, contexto, contexto_historial")
    .eq("id", leadId)
    .single();

  if (!lead) return;

  // La IA actualiza el contexto incorporando la nota humana
  const accion = `Nota manual de ${autor}: ${nota}`;
  const nuevoTexto = await generarActualizacionContexto(
    lead.contexto ?? null,
    accion,
    { nombre: lead.nombre, pipeline_stage: lead.pipeline_stage }
  );

  await guardarContexto(leadId, nuevoTexto, lead.contexto, lead.contexto_historial as EntradaContexto[], "humano", accion, autor);
}

// Persiste el nuevo contexto y gestiona el historial (con compresión S23.4)
async function guardarContexto(
  leadId: string,
  nuevoTexto: string,
  contextoAnterior: string | null,
  historialActual: EntradaContexto[],
  origen: "ia" | "humano",
  accion: string,
  autor?: string
): Promise<void> {
  const supabase = createServiceClient();

  const entradaAnterior: EntradaContexto | null = contextoAnterior
    ? {
        id: randomUUID(),
        contenido: contextoAnterior,
        origen,
        accion,
        ...(autor ? { autor } : {}),
        timestamp: new Date().toISOString(),
      }
    : null;

  const historialNuevo = entradaAnterior
    ? [...historialActual, entradaAnterior]
    : historialActual;

  // S23.4 — Comprimir cuando supera el umbral
  let historialFinal = historialNuevo;
  if (historialNuevo.length > UMBRAL_COMPRESION) {
    const subresumen = await generarSubresumenContexto(historialNuevo.slice(0, -3));
    historialFinal = [
      {
        id: randomUUID(),
        contenido: subresumen,
        origen: "ia",
        accion: "sub-resumen-automatico",
        timestamp: new Date().toISOString(),
      },
      ...historialNuevo.slice(-3),
    ];
  }

  await supabase.from("leads").update({
    contexto: nuevoTexto,
    contexto_historial: historialFinal,
    contexto_updated_at: new Date().toISOString(),
  }).eq("id", leadId);
}
