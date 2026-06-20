// S19.7 — Motor de oferta consultiva basada en señal situacional.
// Orquesta: escanear señales → filtrar fuertes → generar texto → encolar para aprobación.

import { createServiceClient } from "@/lib/supabase/service";
import { escanearSenalesSituacionales, obtenerSenalesActivas } from "@/services/senales-situacionales";
import { generarTextoOfertaConsultiva } from "@/lib/ai/oferta-consultiva";
import { obtenerIdentidad, formatearIdentidadParaPrompt } from "@/services/identidad-marca";
import { encolarRespuesta } from "@/services/mensajes-aprobacion";
import { obtenerFaseLead } from "@/services/cagc";

const CONFIANZA_MINIMA = 0.70;  // umbral para considerar una señal accionable
const FASE_MINIMA     = 3;       // lead debe haber definido su problema antes de recibir oferta

export interface ResultadoOfertaConsultiva {
  generada: boolean;
  texto: string | null;
  senalesUsadas: number;
  motivo: "generada" | "sin_senales" | "fase_baja" | "error";
}

export async function generarOfertaConsultiva(
  leadId: string,
  telefono: string
): Promise<ResultadoOfertaConsultiva> {
  try {
    // 1. Verificar fase CAGC mínima (no ofrecer si el lead está demasiado temprano)
    const estadoCagc = await obtenerFaseLead(leadId).catch(() => null);
    if ((estadoCagc?.fase_numero ?? 0) < FASE_MINIMA) {
      return { generada: false, texto: null, senalesUsadas: 0, motivo: "fase_baja" };
    }

    // 2. Escanear señales (puede detectar nuevas o confirmar existentes)
    await escanearSenalesSituacionales(leadId).catch(() => null);

    // 3. Obtener señales activas fuertes
    const todasLasSenales = await obtenerSenalesActivas(leadId);
    const senalesFuertes = todasLasSenales.filter((s) => s.confianza >= CONFIANZA_MINIMA);

    if (!senalesFuertes.length) {
      return { generada: false, texto: null, senalesUsadas: 0, motivo: "sin_senales" };
    }

    // 4. Contexto del lead
    const supabase = createServiceClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("nombre")
      .eq("id", leadId)
      .single();

    // 5. Servicios KB disponibles (tipos servicio y faq, top 3)
    const { data: servicios } = await supabase
      .from("recursos_conocimiento")
      .select("titulo, contenido")
      .in("tipo", ["servicio", "faq"])
      .eq("aprobado", true)
      .eq("activo", true)
      .order("score_confianza", { ascending: false })
      .limit(3);

    const serviciosTexto = (servicios ?? [])
      .map((s) => `• ${s.titulo}: ${s.contenido.slice(0, 120)}`)
      .join("\n") || "Certificaciones CONOCER para competencias laborales.";

    // 6. Identidad de marca
    const identidad = await obtenerIdentidad().catch(() => null);
    const brandLinea = identidad ? formatearIdentidadParaPrompt(identidad) : "";

    // 7. Generar texto de la oferta
    const texto = await generarTextoOfertaConsultiva({
      nombreLead:          lead?.nombre ?? null,
      senales:             senalesFuertes,
      faseCAGC:            estadoCagc?.fase_numero ?? null,
      serviciosDisponibles: serviciosTexto,
      brandLinea,
    });

    if (!texto) return { generada: false, texto: null, senalesUsadas: 0, motivo: "error" };

    // 8. Encolar siempre para aprobación del admin (oferta consultiva es decisión humana)
    await encolarRespuesta({
      leadId,
      telefono,
      respuesta: texto,
      bloques:   [texto],
      scoreConfianza: 0.95,  // alta confianza en la señal; admin decide si enviar
    });

    return { generada: true, texto, senalesUsadas: senalesFuertes.length, motivo: "generada" };
  } catch (err) {
    console.error("[oferta-consultiva] Error:", err);
    return { generada: false, texto: null, senalesUsadas: 0, motivo: "error" };
  }
}
