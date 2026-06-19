import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";

export interface ChurnScore {
  leadId: string;
  score: number; // 0-100, donde 100 = riesgo máximo de abandono
  factores: string[];
}

// S9.4 — Calcula el score de riesgo de abandono de un lead post-venta
export async function calcularChurnScore(leadId: string): Promise<ChurnScore> {
  const supabase = createServiceClient();
  const factores: string[] = [];
  let score = 0;

  // Factor 1: días sin mensaje (peso 40)
  const { data: ultimoMsg } = await supabase
    .from("mensajes").select("created_at").eq("lead_id", leadId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const diasSinMsg = ultimoMsg
    ? Math.floor((Date.now() - new Date(ultimoMsg.created_at).getTime()) / 86400000)
    : 30;

  if (diasSinMsg > 14) { score += 40; factores.push(`${diasSinMsg} días sin interacción`); }
  else if (diasSinMsg > 7) { score += 20; factores.push(`${diasSinMsg} días sin interacción`); }

  // Factor 2: avance en SmartBuilderEC (peso 40)
  const { data: acceso } = await supabase
    .from("smartbuilder_accesos").select("ultimo_avance, created_at").eq("lead_id", leadId).maybeSingle();

  if (acceso) {
    const diasDesdeAlta = Math.floor((Date.now() - new Date(acceso.created_at).getTime()) / 86400000);
    const avancePorDia = diasDesdeAlta > 0 ? acceso.ultimo_avance / diasDesdeAlta : 0;
    if (avancePorDia < 0.5 && diasDesdeAlta > 7) {
      score += 30; factores.push(`Avance lento: ${acceso.ultimo_avance}% en ${diasDesdeAlta} días`);
    } else if (acceso.ultimo_avance < 10 && diasDesdeAlta > 14) {
      score += 40; factores.push(`Sin avance significativo (${acceso.ultimo_avance}%)`);
    }
  }

  // Factor 3: promesas incumplidas (peso 20)
  const { count: promesas } = await supabase
    .from("promesas_conversacion")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId).eq("alerta_enviada", true).is("cumplida", null);

  if ((promesas ?? 0) >= 2) { score += 20; factores.push(`${promesas} promesas incumplidas`); }

  return { leadId, score: Math.min(100, score), factores };
}

// S9.4 — Detecta leads en riesgo alto y alerta al admin
export async function verificarChurnYAlertar(): Promise<{ enRiesgo: number }> {
  const supabase = createServiceClient();
  const umbral = Number(process.env.CHURN_SCORE_UMBRAL ?? "60");

  // Solo revisar leads que compraron (post-venta)
  const { data: leads } = await supabase
    .from("leads").select("id, nombre, telefono").eq("pipeline_stage", "Comprado");

  let enRiesgo = 0;

  for (const lead of leads ?? []) {
    const { score, factores } = await calcularChurnScore(lead.id);
    if (score >= umbral) {
      enRiesgo++;
      // Guardar score en metadata del lead
      const { data: actual } = await supabase.from("leads")
        .select("metadata").eq("id", lead.id).single();
      const meta = (actual?.metadata ?? {}) as Record<string, unknown>;
      await supabase.from("leads")
        .update({ metadata: { ...meta, churn_score: score, churn_factores: factores } })
        .eq("id", lead.id);

      // Alerta al admin
      const adminWa = process.env.ADMIN_WHATSAPP;
      if (adminWa) {
        const msg = `⚠️ Riesgo de abandono (score ${score}/100)\n*${lead.nombre ?? lead.telefono}*\n${factores.join(" · ")}`;
        await sendTextMessage(adminWa, msg).catch(() => {});
      }
    }
  }

  return { enRiesgo };
}
