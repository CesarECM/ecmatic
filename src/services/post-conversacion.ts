// S31 — Extracción de hooks fire-and-forget post-conversación (antes en conversacion.ts)
// Permite que conversacion.ts respete el límite de 300 líneas con las adiciones de Sprint 31.
import { detectarCompetidores } from "./competidores";
import { detectarPromesas } from "./promesas";
import { detectarMomentoCierre } from "./momentos-cierre";
import { inferirYRegistrarFase, type EstadoCAGC } from "./cagc";
import { generarOfertaConsultiva } from "./oferta-consultiva";
import { ofrecerLeadmagnet } from "./selector-leadmagnet";
import { ofrecerBrochure } from "./selector-brochure";
import { evaluarYAsignarTarea } from "./motor-tareas";
import { actualizarContextoIA } from "./contexto";
import { actualizarScoreSalud } from "./score-salud";
import type { IntencionClasificada } from "@/lib/supabase/types";

interface ParamsHooks {
  leadId: string;
  telefono: string;
  mensajes: string[];
  historial: string;
  intencion: IntencionClasificada;
  mensajeSalienteId: string | undefined;
  estadoCagc: EstadoCAGC | null;
}

export function dispararHooksPostConversacion(params: ParamsHooks): void {
  const { leadId, telefono, mensajes, historial, intencion, mensajeSalienteId, estadoCagc } = params;
  const textoCompleto = mensajes.join(" ");

  void detectarCompetidores(textoCompleto, leadId).catch(console.error);

  if (mensajeSalienteId) {
    void detectarPromesas(textoCompleto, leadId, mensajeSalienteId).catch(console.error);
    void detectarMomentoCierre(leadId, mensajeSalienteId, textoCompleto, intencion).catch(console.error);
  }

  void inferirYRegistrarFase(leadId, mensajes, historial).catch(console.error);

  if (historial && (estadoCagc?.fase_numero ?? 0) >= 3) {
    void generarOfertaConsultiva(leadId, telefono).catch(console.error);
  }

  if (historial && estadoCagc !== null) {
    void ofrecerLeadmagnet(leadId, telefono, estadoCagc.fase_numero).catch(console.error);
    void ofrecerBrochure(leadId, telefono, estadoCagc.fase_numero).catch(console.error);
  }

  if (historial) {
    import("@/lib/ai/etiquetas-ia").then(({ sugerirEtiquetasParaLead }) => {
      void sugerirEtiquetasParaLead(leadId, mensajes, historial).catch(console.error);
    }).catch(console.error);
  }

  void evaluarYAsignarTarea(leadId, "conversacion").catch(console.error);
  void actualizarContextoIA(leadId, `Conversación WhatsApp — intención: ${intencion}`).catch(console.error);
  void actualizarScoreSalud(leadId).catch(console.error);
}
