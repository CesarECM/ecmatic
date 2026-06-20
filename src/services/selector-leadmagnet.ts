// S20.2 — Motor de selección y oferta de leadmagnet según fase CAGC y contexto.
// Elige el leadmagnet más efectivo para la fase actual y encola el mensaje de oferta.

import { createServiceClient } from "@/lib/supabase/service";
import { listarLeadmagnets, registrarOfrecimiento, type Leadmagnet } from "@/services/leadmagnets";
import { generarMensajeOfertaLeadmagnet } from "@/lib/ai/oferta-leadmagnet";
import { encolarRespuesta } from "@/services/mensajes-aprobacion";

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

    // 3. Nombre del lead
    const supabase = createServiceClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("nombre")
      .eq("id", leadId)
      .single();

    // 4. Generar mensaje de oferta
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

    return { ofrecido: true, leadmagnet: lm, motivo: "ofrecido" };
  } catch (err) {
    console.error("[selector-leadmagnet] Error:", err);
    return { ofrecido: false, leadmagnet: null, motivo: "error" };
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
