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
import { logDebugIA } from "./log-ia";
import type { IntencionClasificada } from "@/lib/supabase/types";

interface ParamsHooks {
  leadId: string;
  telefono: string;
  mensajes: string[];
  historial: string;
  intencion: IntencionClasificada;
  mensajeSalienteId: string | undefined;
  estadoCagc: EstadoCAGC | null;
  traceId?: string;
}

export function dispararHooksPostConversacion(params: ParamsHooks): void {
  const { leadId, telefono, mensajes, historial, intencion, mensajeSalienteId, estadoCagc, traceId } = params;
  const textoCompleto = mensajes.join(" ");

  void logDebugIA("CONVERSACION", `[POST_HOOKS] disparando hooks para lead=${leadId}`,
    { lead_id: leadId, intencion, fase_cagc: estadoCagc?.fase_numero }, "debug", traceId);

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
    void logDebugIA("CONVERSACION", `[LEADMAGNET] evaluando fase_cagc=${estadoCagc.fase_numero}`,
      { lead_id: leadId, fase_cagc: estadoCagc.fase_numero }, "debug", traceId);
    void ofrecerLeadmagnet(leadId, telefono, estadoCagc.fase_numero).catch(console.error);
    void ofrecerBrochure(leadId, telefono, estadoCagc.fase_numero).catch(console.error);
  }

  if (historial) {
    import("@/lib/ai/etiquetas-ia").then(({ sugerirEtiquetasParaLead }) => {
      void logDebugIA("CONVERSACION", "[ETIQUETAS] disparando sugerirEtiquetasParaLead",
        { lead_id: leadId }, "debug", traceId);
      void sugerirEtiquetasParaLead(leadId, mensajes, historial).catch(console.error);
    }).catch(console.error);
  }

  void evaluarYAsignarTarea(leadId, "conversacion").catch(console.error);
  void logDebugIA("CONVERSACION", "[CONTEXTO] actualizando contexto IA",
    { lead_id: leadId, intencion }, "debug", traceId);
  void actualizarContextoIA(leadId, `Conversación WhatsApp — intención: ${intencion}`).catch(console.error);
  void logDebugIA("CONVERSACION", "[SCORE_SALUD] calculando score",
    { lead_id: leadId }, "debug", traceId);
  void actualizarScoreSalud(leadId).catch(console.error);
}
