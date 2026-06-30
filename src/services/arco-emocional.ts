import { callClaudeIA } from "@/lib/ai/client";
import { crearTicketHandoff } from "./tickets";
import { createServiceClient } from "@/lib/supabase/service";

type EstadoArco = "neutro" | "calentando" | "hot_urgente" | "frustrado" | "perdido";

interface ClasificacionArco {
  estado: EstadoArco;
  score: number;
  razon: string;
}

const ESTADOS_VALIDOS: EstadoArco[] = ["neutro", "calentando", "hot_urgente", "frustrado", "perdido"];

async function clasificarArcoEmocional(
  mensajes: string[],
  historial: string,
): Promise<ClasificacionArco> {
  const resp = await callClaudeIA("ARCO_EMOCIONAL", {
    max_tokens: 80,
    system: `Analiza el estado emocional del lead en una conversación de ventas de WhatsApp.
Devuelve ÚNICAMENTE JSON: {"estado":"...","score":0-100,"razon":"..."}

Estados:
- neutro: interacción normal, sin señales relevantes
- calentando: interés creciente, preguntas de detalle o precio
- hot_urgente: listo para decidir ahora (urgencia real: "cómo pago", "cuándo empezamos", deadline inminente)
- frustrado: molestia, impaciencia, duda repetida, siente que no le resuelven
- perdido: indiferencia, dice que no le interesa o que buscará otra opción

score: intensidad del estado (0=mínima, 100=máxima). Para neutro usa 0-30.`,
    messages: [{
      role: "user",
      content: `Historial reciente:\n${historial.slice(-600)}\n\nÚltimos mensajes del lead:\n${mensajes.join("\n")}`,
    }],
  });

  const raw = (resp.content[0] as { text: string }).text.trim();
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return { estado: "neutro", score: 0, razon: "parse fallback" };

  try {
    const parsed = JSON.parse(match[0]) as Partial<ClasificacionArco>;
    return {
      estado: ESTADOS_VALIDOS.includes(parsed.estado as EstadoArco)
        ? (parsed.estado as EstadoArco)
        : "neutro",
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      razon: String(parsed.razon ?? "").slice(0, 200),
    };
  } catch {
    return { estado: "neutro", score: 0, razon: "parse error" };
  }
}

export async function procesarArcoEmocional(
  leadId: string,
  mensajes: string[],
  historial: string,
): Promise<{ triggerHandoff: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const { data: leadRow } = await supabase
    .from("leads")
    .select("arco_emocional, arco_emocional_score")
    .eq("id", leadId)
    .single();

  const arcoAnterior = (leadRow?.arco_emocional ?? "neutro") as EstadoArco;
  const scoreAnterior = Number(leadRow?.arco_emocional_score ?? 0);

  const resultado = await clasificarArcoEmocional(mensajes, historial);

  void supabase
    .from("leads")
    .update({
      arco_emocional:       resultado.estado,
      arco_emocional_score: resultado.score,
      arco_emocional_at:    new Date().toISOString(),
    })
    .eq("id", leadId)
    .then(() => {}, () => {});

  // Hot lead: listo para cerrar ahora → ticket inmediato
  if (resultado.estado === "hot_urgente" && resultado.score >= 70) {
    await crearTicketHandoff(
      leadId,
      `🔥 Lead listo para cerrar (score ${resultado.score}/100). ${resultado.razon}`,
    );
    return { triggerHandoff: true };
  }

  // Frustrado acumulado: al menos dos señales consecutivas de frustración
  const frustradoAcumulado =
    resultado.estado === "frustrado" &&
    resultado.score >= 60 &&
    (arcoAnterior === "frustrado" || scoreAnterior >= 60);

  if (frustradoAcumulado) {
    await crearTicketHandoff(
      leadId,
      `⚠️ Lead frustrado acumulado (score ${resultado.score}/100). ${resultado.razon}`,
    );
    return { triggerHandoff: true };
  }

  return { triggerHandoff: false };
}
