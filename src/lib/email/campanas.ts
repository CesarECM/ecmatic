import { upsertContacto, agregarALista, eliminarDeLista, type BrevoContactoAtributos } from "./brevo";
import type { PipelineRuta, Temperamento } from "@/lib/supabase/types";

// IDs de listas Brevo — configurables por env var
// Las listas se crean en el panel de Brevo y sus IDs se copian aquí
function listaIdPorRuta(ruta: PipelineRuta): number | null {
  const id = ruta === "tripwire"
    ? process.env.BREVO_LIST_ID_TRIPWIRE
    : process.env.BREVO_LIST_ID_PREMIUM;
  return id ? Number(id) : null;
}

function listaIdPorDisc(disc: Temperamento): number | null {
  const key = `BREVO_LIST_ID_DISC_${disc}`;
  const id = process.env[key];
  return id ? Number(id) : null;
}

export interface LeadParaBrevo {
  email: string | null;
  nombre: string | null;
  telefono: string | null;
  pipeline_stage: string;
  pipeline_ruta: PipelineRuta;
  temperamento_inferido: Temperamento | null;
  score_salud: number;
}

// S4.3 — Sincroniza un lead con Brevo al crearse o actualizarse
// Mantiene atributos actualizados para que las automatizaciones de Brevo lo segmenten
export async function sincronizarLeadEnBrevo(lead: LeadParaBrevo): Promise<void> {
  if (!lead.email) return;

  const atributos: BrevoContactoAtributos = {
    NOMBRE: lead.nombre ?? undefined,
    TELEFONO: lead.telefono ?? undefined,
    PIPELINE_STAGE: lead.pipeline_stage,
    PIPELINE_RUTA: lead.pipeline_ruta,
    DISC: lead.temperamento_inferido ?? undefined,
    SCORE_SALUD: lead.score_salud,
  };

  // Determina las listas aplicables
  const listaIds: number[] = [];
  const listaRuta = listaIdPorRuta(lead.pipeline_ruta);
  if (listaRuta) listaIds.push(listaRuta);
  if (lead.temperamento_inferido) {
    const listaDisc = listaIdPorDisc(lead.temperamento_inferido);
    if (listaDisc) listaIds.push(listaDisc);
  }

  await upsertContacto(lead.email, atributos, listaIds);
}

// S4.3 — Mueve un lead entre listas cuando cambia su etapa de pipeline
// Ejemplo: sale de lista "Interesado" y entra a "Propuesta"
export async function actualizarListasAlMoverEtapa(
  email: string | null,
  etapaAnterior: string,
  etapaNueva: string
): Promise<void> {
  if (!email) return;

  // Las listas por etapa se referencian por env vars BREVO_LIST_ID_ETAPA_{NOMBRE}
  const idAnterior = etapaAnterior
    ? (process.env[`BREVO_LIST_ID_ETAPA_${etapaAnterior.toUpperCase().replace(/\s/g, "_")}`])
    : undefined;
  const idNueva = process.env[`BREVO_LIST_ID_ETAPA_${etapaNueva.toUpperCase().replace(/\s/g, "_")}`];

  if (idAnterior) await eliminarDeLista(email, Number(idAnterior)).catch(console.error);
  if (idNueva) await agregarALista(email, Number(idNueva)).catch(console.error);
}

// S4.3 — Elimina al lead de todas las listas de nurturing al comprar o perderse
export async function excluirDeNurturing(
  email: string | null,
  ruta: PipelineRuta
): Promise<void> {
  if (!email) return;
  const listaRuta = listaIdPorRuta(ruta);
  if (listaRuta) await eliminarDeLista(email, listaRuta).catch(console.error);

  // Eliminar de todas las listas de etapas conocidas
  const etapas = ["Nuevo", "Contactado", "Interesado", "Propuesta", "Negociación",
    "Primer_Contacto", "Diagnóstico", "Seguimiento", "Decisión"];
  for (const etapa of etapas) {
    const key = `BREVO_LIST_ID_ETAPA_${etapa.toUpperCase().replace(/\s/g, "_")}`;
    const id = process.env[key];
    if (id) await eliminarDeLista(email, Number(id)).catch(console.error);
  }
}
