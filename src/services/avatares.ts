import { createServiceClient } from "@/lib/supabase/service";
import { callClaudeIA } from "@/lib/ai/client";

export interface SugerenciaAvatar {
  tipo: "fusionar" | "eliminar";
  avatarIds: string[];
  razon: string;
}

// S5.6 — Clasifica un lead asignándole el avatar más similar o creando uno nuevo.
export async function clasificarLead(leadId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, temperamento_inferido, canal_origen, pipeline_ruta, score_salud, metadata")
    .eq("id", leadId)
    .single();

  if (!lead) return;

  const { data: avatares } = await supabase
    .from("avatares")
    .select("id, codigo, tipo, caracteristicas")
    .eq("activo", true);

  if (!avatares || avatares.length === 0) {
    await crearAvatarDesdeIA(leadId, lead);
    return;
  }

  const avatarId = elegirAvatarMasSimilar(lead, avatares);
  if (avatarId) {
    await supabase.from("leads").update({ avatar_id: avatarId }).eq("id", leadId);
  } else {
    await crearAvatarDesdeIA(leadId, lead);
  }
}

function elegirAvatarMasSimilar(
  lead: Record<string, unknown>,
  avatares: { id: string; tipo: string; caracteristicas: Record<string, unknown> }[]
): string | null {
  let mejorScore = 0;
  let mejorId: string | null = null;

  for (const av of avatares) {
    let score = 0;
    const c = av.caracteristicas;
    if (c.temperamento === lead.temperamento_inferido) score += 3;
    if (c.canal_origen === lead.canal_origen) score += 2;
    if (c.pipeline_ruta === lead.pipeline_ruta) score += 2;
    const scoreSalud = lead.score_salud as number;
    const avScore = c.score_salud_promedio as number | undefined;
    if (avScore && Math.abs(scoreSalud - avScore) < 20) score += 1;
    if (score > mejorScore && score >= 4) {
      mejorScore = score;
      mejorId = av.id;
    }
  }
  return mejorId;
}

async function crearAvatarDesdeIA(
  leadId: string,
  lead: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();
  const { data: totalAvatares } = await supabase
    .from("avatares")
    .select("id", { count: "exact" });
  const siguiente = (totalAvatares?.length ?? 0) + 1;
  const ruta = lead.pipeline_ruta === "premium" ? "B2B" : "B2C";
  const codigo = `${ruta}-${siguiente}`;

  const { data: avNuevo } = await supabase
    .from("avatares")
    .insert({
      codigo,
      nombre: `Avatar ${codigo}`,
      tipo: ruta as "B2C" | "B2B",
      descripcion: `Generado automáticamente desde lead ${leadId}`,
      caracteristicas: {
        temperamento: lead.temperamento_inferido,
        canal_origen: lead.canal_origen,
        pipeline_ruta: lead.pipeline_ruta,
        score_salud_promedio: lead.score_salud,
      },
    })
    .select("id")
    .single();

  if (avNuevo) {
    await supabase.from("leads").update({ avatar_id: avNuevo.id }).eq("id", leadId);
  }
}

// S5.7 — Analiza avatares semanalmente y propone fusiones o eliminaciones.
// Nunca ejecuta cambios sin aprobación del admin.
export async function revisarAvatares(): Promise<SugerenciaAvatar[]> {
  const supabase = createServiceClient();

  const { data: avatares } = await supabase
    .from("avatares")
    .select("id, codigo, nombre, tipo, caracteristicas, activo")
    .eq("activo", true);

  if (!avatares || avatares.length < 2) return [];

  const conteoPorAvatar: Record<string, number> = {};
  for (const av of avatares) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("avatar_id", av.id);
    conteoPorAvatar[av.id] = count ?? 0;
  }

  const prompt = `Analiza estos avatares de leads para un CRM de certificaciones CONOCER.
Identifica cuáles deberían fusionarse (muy similares) o eliminarse (sin leads o características únicas).
Responde en JSON: [{"tipo":"fusionar"|"eliminar","avatarIds":["id1","id2"],"razon":"..."}]

Avatares:
${avatares.map((a) => `ID:${a.id} Código:${a.codigo} Tipo:${a.tipo} Leads:${conteoPorAvatar[a.id]} Características:${JSON.stringify(a.caracteristicas)}`).join("\n")}`;

  try {
    const res = await callClaudeIA("ANALISIS", {
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const texto = (res.content[0] as { text: string }).text.trim();
    const json = texto.match(/\[[\s\S]*\]/)?.[0];
    return json ? (JSON.parse(json) as SugerenciaAvatar[]) : [];
  } catch {
    return [];
  }
}

export async function obtenerAvatares() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("avatares")
    .select("*")
    .eq("activo", true)
    .order("codigo");
  if (error) throw new Error(`[avatares] Error: ${error.message}`);
  return data ?? [];
}
