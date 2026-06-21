// S24.3 — Motor de selección y oferta proactiva de brochure según fase CAGC.
// Misma lógica que selector-leadmagnet: cooldown → selección → mensaje → encolar.

import { createServiceClient } from "@/lib/supabase/service";
import { listarBrochures, registrarOfrecimientoBrochure, type Brochure } from "@/services/brochures";
import { generarMensajeOfertaBrochure } from "@/lib/ai/oferta-brochure";
import { encolarRespuesta } from "@/services/mensajes-aprobacion";

const SCORE_MINIMO       = 0.30;
const COOLDOWN_HORAS     = 24;
const SCORE_COLA_BROCHURE = 0.75; // distinto al de leadmagnets (0.80) para cooldowns independientes

export interface ResultadoSeleccionBrochure {
  ofrecido: boolean;
  brochure: Brochure | null;
  motivo: "ofrecido" | "sin_match" | "cooldown" | "score_bajo" | "error";
}

export async function ofrecerBrochure(
  leadId: string,
  telefono: string,
  faseCagc: number
): Promise<ResultadoSeleccionBrochure> {
  try {
    // 1. Cooldown: ¿ya se ofreció un brochure en las últimas COOLDOWN_HORAS?
    const enCooldown = await verificarCooldown(leadId);
    if (enCooldown) return { ofrecido: false, brochure: null, motivo: "cooldown" };

    // 2. Seleccionar mejor candidato para esta fase
    const brochure = await seleccionarBrochure(faseCagc);
    if (!brochure) return { ofrecido: false, brochure: null, motivo: "sin_match" };

    if (brochure.score_efectividad < SCORE_MINIMO) {
      return { ofrecido: false, brochure, motivo: "score_bajo" };
    }

    // 3. Datos del lead y servicio vinculado
    const supabase = createServiceClient();
    const [{ data: lead }, tituloServicio] = await Promise.all([
      supabase.from("leads").select("nombre").eq("id", leadId).single(),
      brochure.recurso_id
        ? supabase
            .from("recursos_conocimiento")
            .select("titulo")
            .eq("id", brochure.recurso_id)
            .single()
            .then((r) => r.data?.titulo ?? null, () => null)
        : Promise.resolve(null),
    ]);

    // 4. Generar mensaje de oferta
    const mensaje = await generarMensajeOfertaBrochure({
      nombreLead:          lead?.nombre ?? null,
      tituloBrochure:      brochure.titulo,
      descripcionBrochure: brochure.descripcion,
      tituloServicio,
      faseCAGC:            faseCagc,
    });

    if (!mensaje) return { ofrecido: false, brochure, motivo: "error" };

    // 5. Encolar para aprobación del admin (incluye URL en el bloque de aprobación)
    const bloqueConUrl = `${mensaje}\n${brochure.url}`;
    await encolarRespuesta({
      leadId,
      telefono,
      respuesta:      bloqueConUrl,
      bloques:        [mensaje, brochure.url],
      scoreConfianza: SCORE_COLA_BROCHURE,
    });

    // 6. Registrar ofrecimiento
    await registrarOfrecimientoBrochure(brochure.id, false);

    return { ofrecido: true, brochure, motivo: "ofrecido" };
  } catch (err) {
    console.error("[selector-brochure] Error:", err);
    return { ofrecido: false, brochure: null, motivo: "error" };
  }
}

async function seleccionarBrochure(faseCagc: number): Promise<Brochure | null> {
  const candidatos = await listarBrochures({ faseCagc, soloActivos: true });
  const validos = candidatos.filter((b) => b.score_efectividad >= SCORE_MINIMO);
  return validos[0] ?? null; // ya vienen ordenados por score DESC
}

async function verificarCooldown(leadId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - COOLDOWN_HORAS * 60 * 60 * 1000).toISOString();

  const { count } = await (supabase as any)
    .from("mensajes_cola_aprobacion")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("score_confianza", SCORE_COLA_BROCHURE)
    .gte("created_at", desde);

  return (count ?? 0) > 0;
}
