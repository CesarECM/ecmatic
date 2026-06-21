// S16.3 — Motor de simulación: reproduce el flujo completo de conversacion.ts
// sin enviar mensajes reales por WhatsApp ni crear tickets de handoff.
import { guardarMensaje, obtenerHistorial } from "./mensajes";
import { clasificarIntencion } from "@/lib/ai/clasificador";
import { generarRespuesta, necesitaHandoff } from "@/lib/ai/motor-respuesta";
import { obtenerFaseLead } from "./cagc";
import { obtenerEtiquetasLead } from "./etiquetas";
import { obtenerSlotsDisponibles, asignarMejorVendedor } from "./citas";
import { logAgen } from "./log-agendamiento";
import { createServiceClient } from "@/lib/supabase/service";

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
  const supabase = createServiceClient();
  // Cada sesión tiene su propio número de prueba para aislar el historial
  const telefono = `sandbox_${sessionId.slice(0, 12)}`;

  // Upsert lead de prueba — privacidad pre-aceptada para no bloquear el flujo.
  // is_test viene de la migración 00016; cast a any hasta que se regeneren los tipos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = { telefono, is_test: true, privacidad_aceptada: true, canal_origen: "sandbox" };
  const { data: lead, error } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "telefono" })
    .select("id, nombre, temperamento_inferido, pipeline_stage, pipeline_ruta, compra_previa")
    .single();

  if (error || !lead) throw new Error(`No se pudo crear lead de prueba: ${error?.message}`);

  // Historial acumulado de la sesión (context window para la IA)
  const historial = await obtenerHistorial(lead.id);

  // Clasificar intención del mensaje actual
  const intencion = await clasificarIntencion([mensaje], historial);

  // Persistir mensaje entrante para que el siguiente turno tenga contexto
  await guardarMensaje({
    leadId: lead.id,
    contenido: mensaje,
    direccion: "entrante",
    intencion,
  });

  // Estado CAGC y etiquetas actuales
  const [estadoCagc, etiquetasLead] = await Promise.all([
    obtenerFaseLead(lead.id).catch(() => null),
    obtenerEtiquetasLead(lead.id).catch(() => [] as Array<{ categoria: string; nombre: string }>),
  ]);

  // Slots de calendario cuando el lead quiere agendar (igual que en conversacion.ts)
  let slotsParaAI = undefined;
  if (intencion === "quiere_agendar") {
    try {
      const vendedorId = await asignarMejorVendedor();
      if (vendedorId) {
        slotsParaAI = await obtenerSlotsDisponibles(vendedorId);
        void logAgen({ paso: "slots_consultados", leadId: lead.id, vendedorId,
          detalle: `[sandbox] Intención quiere_agendar — ${slotsParaAI.length} slots disponibles`,
          metadata: { slots: slotsParaAI.length, vendedor_id: vendedorId, origen: "sandbox" } });
      }
    } catch (err) {
      void logAgen({ paso: "error", nivel: "error", leadId: lead.id,
        detalle: `[sandbox] Error obteniendo slots: ${err instanceof Error ? err.message : String(err)}` });
    }
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
  });

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
