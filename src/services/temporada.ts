import { createServiceClient } from "@/lib/supabase/service";
import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { registrarUsoIA } from "./alertas-ia";

// S11.5 — Analiza historial de conversiones por mes y predice si se aproxima temporada alta
export async function verificarTemporadaAlta(): Promise<{
  esTemporadaAlta: boolean;
  propuestaEnviada: boolean;
}> {
  const supabase = createServiceClient();

  // Conversiones por mes en el último año
  const { data: pagos } = await supabase
    .from("pagos")
    .select("created_at")
    .eq("estado", "completado")
    .gte("created_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());

  const conteoMes: Record<number, number> = {};
  for (const p of pagos ?? []) {
    const mes = new Date(p.created_at).getMonth();
    conteoMes[mes] = (conteoMes[mes] ?? 0) + 1;
  }

  const valores = Object.values(conteoMes);
  if (valores.length < 3) return { esTemporadaAlta: false, propuestaEnviada: false };

  const promedio = valores.reduce((s, v) => s + v, 0) / valores.length;
  const mesSiguiente = (new Date().getMonth() + 1) % 12;
  const conversionesMesSig = conteoMes[mesSiguiente] ?? 0;
  const esTemporadaAlta = conversionesMesSig > promedio * 1.15;

  if (!esTemporadaAlta) return { esTemporadaAlta: false, propuestaEnviada: false };

  const adminWa = process.env.ADMIN_WHATSAPP;
  if (!adminWa) return { esTemporadaAlta: true, propuestaEnviada: false };

  // Generar propuesta de campaña con IA
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const prompt = `El mes de ${meses[mesSiguiente]} históricamente tiene ${Math.round(((conversionesMesSig - promedio) / promedio) * 100)}% más conversiones de lo normal para un centro de certificaciones CONOCER. Genera una propuesta de campaña de reactivación breve (3 puntos) para aprovechar esta temporada alta. En español, orientada a WhatsApp.`;

  try {
    const res = await anthropic.messages.create({
      model: modeloPorTarea("ANALISIS"), max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    void registrarUsoIA("anthropic", res.usage.input_tokens, res.usage.output_tokens).catch(() => {});
    const propuesta = (res.content[0] as { text: string }).text.trim();

    const msg = `📈 ECMatic — Temporada alta detectada\n*${meses[mesSiguiente]}* tiene históricamente ${Math.round(conversionesMesSig / promedio * 100 - 100)}% más conversiones.\n\nPropuesta de campaña:\n${propuesta}`;
    await sendTextMessage(adminWa, msg);
    return { esTemporadaAlta: true, propuestaEnviada: true };
  } catch {
    return { esTemporadaAlta: true, propuestaEnviada: false };
  }
}
