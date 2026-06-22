// S20.2/S20.4 — Motor de selección y oferta de leadmagnet según fase CAGC y contexto.
// Elige el leadmagnet más efectivo para la fase actual.
// · pre-creado / generable-ia → encola mensaje de oferta para aprobación del admin.
// · requiere-humano           → arma brief contextual y asigna tarea urgente (S20.4).

import { createServiceClient } from "@/lib/supabase/service";
import { listarLeadmagnets, registrarOfrecimiento, type Leadmagnet } from "@/services/leadmagnets";
import { generarMensajeOfertaLeadmagnet } from "@/lib/ai/oferta-leadmagnet";
import { encolarRespuesta } from "@/services/mensajes-aprobacion";
import { asignarTarea } from "@/services/tareas";
import { obtenerHistorial } from "@/services/mensajes";
import { inscribirEnPipeline } from "@/services/pipeline-multi";
import { evaluarCulminacionPorLeadmagnet } from "@/services/culminacion-pipeline";

const SCORE_MINIMO       = 0.30;  // no ofrecer leadmagnets con histórico muy malo
const COOLDOWN_HORAS     = 24;    // no ofrecer más de uno por lead cada 24 h
const SCORE_COLA_LEADMAG = 0.80;  // confianza con la que entra a la cola

export interface ResultadoSeleccion {
  ofrecido: boolean;
  leadmagnet: Leadmagnet | null;
  motivo: "ofrecido" | "sin_match" | "cooldown" | "score_bajo" | "error";
}

// Devuelve el leadmagnet más efectivo para la fase CAGC indicada, o null si no hay match.
export async function seleccionarLeadmagnet(faseCagc: number): Promise<Leadmagnet | null> {
  const candidatos = await listarLeadmagnets({ faseCagc, soloActivos: true });

  const validos = candidatos.filter((lm) => lm.score_efectividad >= SCORE_MINIMO);
  if (!validos.length) return null;

  // Ya vienen ordenados por score_efectividad DESC desde listarLeadmagnets
  return validos[0];
}

// Flujo completo: verificar cooldown → seleccionar → generar mensaje → encolar.
export async function ofrecerLeadmagnet(
  leadId: string,
  telefono: string,
  faseCagc: number
): Promise<ResultadoSeleccion> {
  try {
    // 1. Cooldown: ¿ya hay una oferta de leadmagnet pendiente en las últimas COOLDOWN_HORAS?
    const enCooldown = await verificarCooldown(leadId);
    if (enCooldown) {
      return { ofrecido: false, leadmagnet: null, motivo: "cooldown" };
    }

    // 2. Seleccionar mejor candidato para esta fase
    const lm = await seleccionarLeadmagnet(faseCagc);
    if (!lm) {
      return { ofrecido: false, leadmagnet: null, motivo: "sin_match" };
    }

    if (lm.score_efectividad < SCORE_MINIMO) {
      return { ofrecido: false, leadmagnet: lm, motivo: "score_bajo" };
    }

    // 3. Datos del lead
    const supabase = createServiceClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("nombre, pipeline_stage")
      .eq("id", leadId)
      .single();

    // S20.4 — Leadmagnet humano: brief contextual + tarea urgente en lugar de cola WA
    if (lm.tipo === "requiere-humano") {
      return await gestionarLeadmagnetHumano(leadId, lm, lead, faseCagc);
    }

    // 4. Generar mensaje de oferta (pre-creado / generable-ia)
    const mensaje = await generarMensajeOfertaLeadmagnet({
      nombreLead:           lead?.nombre ?? null,
      tituloLeadmagnet:     lm.titulo,
      descripcionLeadmagnet: lm.descripcion,
      tipoLeadmagnet:       lm.tipo,
      faseCAGC:             faseCagc,
    });

    if (!mensaje) return { ofrecido: false, leadmagnet: lm, motivo: "error" };

    // 5. Encolar para aprobación del admin
    await encolarRespuesta({
      leadId,
      telefono,
      respuesta: mensaje,
      bloques:   [mensaje],
      scoreConfianza: SCORE_COLA_LEADMAG,
    });

    // 6. Registrar ofrecimiento para actualizar score_efectividad en el futuro
    await registrarOfrecimiento(lm.id, false);  // aceptado=false hasta que el admin lo apruebe y el lead responda

    // S28.7 — Si el leadmagnet activa multi-pipeline, evaluar culminación del pipeline más atrasado
    if (lm.fases_cagc_objetivo?.length) {
      const rutaLm = lm.fases_cagc_objetivo[0] <= 3 ? "tripwire" : "premium";
      void inscribirEnPipeline(leadId, rutaLm).then(() =>
        evaluarCulminacionPorLeadmagnet(leadId, rutaLm)
      ).catch(console.error);
    }

    return { ofrecido: true, leadmagnet: lm, motivo: "ofrecido" };
  } catch (err) {
    console.error("[selector-leadmagnet] Error:", err);
    return { ofrecido: false, leadmagnet: null, motivo: "error" };
  }
}

// S20.4 — Gestiona leadmagnets de tipo requiere-humano.
// Ensambla un brief con contexto completo y asigna una tarea urgente de tipo "informacion".
async function gestionarLeadmagnetHumano(
  leadId: string,
  lm: Leadmagnet,
  lead: { nombre: string | null; pipeline_stage: string } | null,
  faseCagc: number
): Promise<ResultadoSeleccion> {
  try {
    // Últimas 4 líneas del historial como contexto para el vendedor
    const historialTexto = await obtenerHistorial(leadId, 4).catch(() => "");

    const brief = [
      `🎯 LEADMAGNET HUMANO: ${lm.titulo}`,
      `Lead: ${lead?.nombre ?? "Sin nombre"} | Fase CAGC: ${faseCagc} | Stage: ${lead?.pipeline_stage ?? "—"}`,
      `Qué entregar: ${lm.descripcion}`,
      `Acción: Contactar al lead y entregar este material personalmente.`,
      historialTexto ? `Contexto reciente:\n${historialTexto}` : "",
    ].filter(Boolean).join("\n");

    await asignarTarea(leadId, "informacion", brief);
    await registrarOfrecimiento(lm.id, false);

    return { ofrecido: true, leadmagnet: lm, motivo: "ofrecido" };
  } catch (err) {
    console.error("[selector-leadmagnet] Error en leadmagnet humano:", err);
    return { ofrecido: false, leadmagnet: lm, motivo: "error" };
  }
}

// Verifica si ya existe una oferta pendiente de leadmagnet en las últimas COOLDOWN_HORAS.
// Usa la cola de aprobación como fuente de verdad (score 0.80 = firma del motor).
async function verificarCooldown(leadId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - COOLDOWN_HORAS * 60 * 60 * 1000).toISOString();

  const { count } = await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("score_confianza", SCORE_COLA_LEADMAG)
    .gte("created_at", desde);

  return (count ?? 0) > 0;
}
