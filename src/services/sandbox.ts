// S16.3 — Motor de simulación: reproduce el flujo completo de conversacion.ts
// sin enviar mensajes reales por WhatsApp ni crear tickets de handoff.
import { randomUUID } from "crypto";
import { guardarMensaje, obtenerHistorial } from "./mensajes";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { generarRespuesta, necesitaHandoff } from "@/lib/ai/motor-respuesta";
import { obtenerFaseLead } from "./cagc";
import { obtenerEtiquetasLead } from "./etiquetas";
import { obtenerSlotsDisponibles, asignarMejorVendedor, crearCitaConMeet } from "./citas";
import { detectarSlotSeleccionado } from "@/lib/ai/slot-matcher";
import { logAgen } from "./log-agendamiento";
import { logDebugIA } from "./log-ia";
import { createServiceClient } from "@/lib/supabase/service";
import { capturarContactoPasivo } from "./captura-contacto";
// S31 — Paridad con conversacion.ts
import { evaluarFaseSetter } from "@/lib/ai/setter-protocol";
import { detectarRevelacion, calcularNuevoModo, type ModoRevelacion } from "@/lib/ai/detector-revelacion";
import { filtrarResistencia } from "@/lib/ai/filtro-objecion";
import { identificarDesconfianza } from "@/lib/ai/tres-desconfianzas";
import { construirProtocoloObjecion } from "@/lib/ai/protocolo-objecion";
import { obtenerRolDinamico } from "./rol-dinamico";

export interface SandboxResult {
  respuesta: string;
  scoreConfianza: number;
  intencion: string;
  faseCAGC: number | null;
  etiquetas: string[];
  handoff: boolean;
  mensajeId: string | null; // S21.1 — ID del mensaje saliente para votos de calidad
}

export async function procesarSandbox(
  sessionId: string,
  mensaje: string
): Promise<SandboxResult> {
  const traceId = randomUUID();
  const supabase = createServiceClient();
  // Cada sesión tiene su propio número de prueba para aislar el historial
  const telefono = `sandbox_${sessionId.slice(0, 12)}`;
  void logDebugIA("CONVERSACION_SANDBOX", `[CONV_INICIO] session=${sessionId.slice(0,8)} "${mensaje.slice(0,100)}"`,
    { session_id: sessionId.slice(0, 12), texto_inicio: mensaje.slice(0, 100) }, "debug", traceId);

  // Upsert lead de prueba — privacidad pre-aceptada para no bloquear el flujo.
  // is_test viene de la migración 00016; cast a any hasta que se regeneren los tipos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = { telefono, is_test: true, privacidad_aceptada: true, canal_origen: "sandbox" };
  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "telefono" })
    .select("id, nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa, setter_fase_actual, setter_calificado, modo_revelacion")
    .single();

  if (error || !lead) throw new Error(`No se pudo crear lead de prueba: ${error?.message}`);

  // Historial acumulado de la sesión (context window para la IA)
  const historial = await obtenerHistorial(lead.id);

  // Clasificar intención del mensaje actual
  const intencion = await clasificarIntencion([mensaje], historial);
  void logDebugIA("CONVERSACION_SANDBOX", `[CLASIFICACION] intencion=${intencion}`,
    { intencion, lead_id: lead.id }, "debug", traceId);

  // Persistir mensaje entrante para que el siguiente turno tenga contexto
  await guardarMensaje({
    leadId: lead.id,
    contenido: mensaje,
    direccion: "entrante",
    intencion,
  });

  // Capturar nombre/email si el lead los menciona en el texto (igual que conversacion.ts)
  void capturarContactoPasivo(lead.id, [mensaje]).catch(console.error);

  // Estado CAGC y etiquetas actuales
  const [estadoCagc, etiquetasLead] = await Promise.all([
    obtenerFaseLead(lead.id).catch(() => null),
    obtenerEtiquetasLead(lead.id).catch(() => [] as Array<{ categoria: string; nombre: string }>),
  ]);
  void logDebugIA("CONVERSACION_SANDBOX", `[CAGC] fase=${estadoCagc?.fase_numero ?? "?"} etapa=${lead.pipeline_stage}`,
    { fase_cagc: estadoCagc?.fase_numero, pipeline_stage: lead.pipeline_stage }, "debug", traceId);

  let slotsParaAI = undefined;
  let meetLinkParaAI: string | null = null;

  if (intencion === "quiere_agendar") {
    try {
      const vendedorId = await asignarMejorVendedor();
      if (vendedorId) {
        slotsParaAI = await obtenerSlotsDisponibles(vendedorId);
        void logAgen({ paso: "slots_consultados", leadId: lead.id, vendedorId,
          detalle: `[sandbox] Intención quiere_agendar — ${slotsParaAI.length} slots disponibles`,
          metadata: { slots: slotsParaAI.length, vendedor_id: vendedorId, origen: "sandbox" } });
        void logDebugIA("CONVERSACION_SANDBOX", `[CALENDARIO] ${slotsParaAI.length} slots disponibles`,
          { slots_count: slotsParaAI.length, vendedor_id: vendedorId }, "debug", traceId);
      }
    } catch (err) {
      void logAgen({ paso: "error", nivel: "error", leadId: lead.id,
        detalle: `[sandbox] Error obteniendo slots: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  if (intencion === "confirmando_slot") {
    try {
      const vendedorId = await asignarMejorVendedor();
      if (vendedorId) {
        const slots = await obtenerSlotsDisponibles(vendedorId);
        const slot = await detectarSlotSeleccionado(mensaje, slots);
        if (slot) {
          const { citaId, meetLink } = await crearCitaConMeet({ leadId: lead.id, vendedorId, inicio: slot.inicio, fin: slot.fin });
          meetLinkParaAI = meetLink;
          void logAgen({ paso: "cita_creada", citaId, leadId: lead.id, vendedorId,
            detalle: "[sandbox] Cita creada desde conversación", metadata: { meetLink, inicio: slot.inicio.toISOString(), origen: "sandbox" } });
          void logDebugIA("CONVERSACION_SANDBOX", `[CALENDARIO] cita creada meet=${!!meetLink}`,
            { cita_id: citaId, inicio: slot.inicio.toISOString() }, "debug", traceId);
        }
      }
    } catch (err) {
      void logAgen({ paso: "error", nivel: "error", leadId: lead.id,
        detalle: `[sandbox] Error creando cita: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // S31 — Setter, Objeción, Rol Dinámico + Detector Revelación (paridad con conversacion.ts)
  const setterFaseActual: number = (lead.setter_fase_actual as number | null) ?? 1;
  const setterCalificado: boolean | null = (lead.setter_calificado as boolean | null) ?? null;
  const esObjecion = intencion === "objecion_precio" || intencion === "objecion_confianza";
  const setterActivo = setterCalificado === null;
  const modoRevelacionActual = ((lead as unknown as { modo_revelacion?: string })?.modo_revelacion ?? "oculto") as ModoRevelacion; // cast por upsert que no usa los tipos generados

  const [setterEstado, filtroResult, rolesDinamicos, señalRevelacion] = await Promise.all([
    setterActivo && historial
      ? evaluarFaseSetter(setterFaseActual, [mensaje], historial, lead.temperamento_inferido ?? null).catch(() => null)
      : Promise.resolve(null),
    esObjecion
      ? filtrarResistencia([mensaje], historial).catch(() => null)
      : Promise.resolve(null),
    obtenerRolDinamico(lead.id).catch(() => []),
    modoRevelacionActual !== "revelado"
      ? detectarRevelacion([mensaje], historial, modoRevelacionActual, { leadId: lead.id }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const nuevoModoRevelacion = calcularNuevoModo(modoRevelacionActual, señalRevelacion);
  if (nuevoModoRevelacion !== modoRevelacionActual) {
    void (async () => { await supabase.from("leads").update({ modo_revelacion: nuevoModoRevelacion }).eq("id", lead.id); })().catch(console.error);
    void logDebugIA("CONVERSACION_SANDBOX", `[REVELACION] ${modoRevelacionActual}→${nuevoModoRevelacion}`, { señal: señalRevelacion }, "debug", traceId);
  }

  if (setterEstado) void logDebugIA("CONVERSACION_SANDBOX", `[SETTER] fase ${setterFaseActual}→${setterEstado.faseNueva} avanza=${setterEstado.debeAvanzar}`,
    { fase_actual: setterFaseActual, fase_nueva: setterEstado.faseNueva, avanza: setterEstado.debeAvanzar }, "debug", traceId);
  if (filtroResult) void logDebugIA("CONVERSACION_SANDBOX", `[OBJECION] tipo=${filtroResult.tipo}`,
    { tipo: filtroResult.tipo }, "debug", traceId);

  if (setterEstado?.debeAvanzar && setterEstado.faseNueva !== setterFaseActual) {
    void (async () => {
      await supabase.from("leads").update({ setter_fase_actual: setterEstado!.faseNueva }).eq("id", lead.id);
    })().catch(console.error);
  }

  let protocoloObjecion = null;
  if (filtroResult) {
    const desconfianza = filtroResult.tipo === "objecion"
      ? await identificarDesconfianza([mensaje], historial).catch(() => null)
      : null;
    protocoloObjecion = construirProtocoloObjecion(filtroResult.tipo, desconfianza?.tipo ?? null);
  }

  // Generar respuesta con el mismo motor que usa WhatsApp
  const { texto: respuesta, scoreConfianza } = await generarRespuesta([mensaje], {
    nombre: lead.nombre ?? null,
    temperamento: lead.temperamento_inferido ?? null,
    pipelineStage: lead.pipeline_stage ?? "Nuevo",
    compraPreviaa: lead.compra_previa ?? false,
    historial,
    pipelineRuta: lead.pipeline_ruta ?? "tripwire",
    faseCAGC: estadoCagc?.fase_numero,
    etiquetas: etiquetasLead.map((e) => `${e.categoria}:${e.nombre}`),
    slotsDisponibles: slotsParaAI,
    meetLink: meetLinkParaAI,
    canal_origen: "whatsapp",
    setterEstado,
    protocoloObjecion,
    rolesDinamicos,
    modoRevelacion: nuevoModoRevelacion,
  });

  void logDebugIA("CONVERSACION_SANDBOX", `[RESPUESTA_FINAL] score=${scoreConfianza.toFixed(2)} "${respuesta.slice(0,200)}"`,
    { score_confianza: scoreConfianza, respuesta_inicio: respuesta.slice(0, 200) }, "debug", traceId);

  // Detectar si la respuesta activaría handoff
  const handoff = await necesitaHandoff([mensaje], respuesta);

  // S21.1 — Guardar respuesta y capturar ID para votos de calidad
  const msgSaliente = await guardarMensaje({
    leadId: lead.id,
    contenido: respuesta,
    direccion: "saliente",
  });

  return {
    respuesta,
    scoreConfianza,
    intencion,
    faseCAGC: estadoCagc?.fase_numero ?? null,
    etiquetas: etiquetasLead.map((e) => e.nombre),
    handoff,
    mensajeId: msgSaliente?.id ?? null,
  };
}
