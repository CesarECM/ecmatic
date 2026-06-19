import { createServiceClient } from "@/lib/supabase/service";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/client";
import type { TipoGatillo, AudienciaGatillo, PipelineRuta } from "@/lib/supabase/types";

export interface Gatillo {
  id: string;
  tipo: TipoGatillo;
  nombre: string;
  valor_actual: string;
  activo: boolean;
  fecha_expiracion: string | null;
  audiencia_objetivo: AudienciaGatillo;
  alerta_enviada: boolean;
  created_at: string;
  updated_at: string;
}

// S6.2 — Lista todos los gatillos para el panel admin
export async function listarGatillos(): Promise<Gatillo[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("gatillos")
    .select("*")
    .order("activo", { ascending: false })
    .order("tipo");
  if (error) throw new Error(`[gatillos] Error: ${error.message}`);
  return (data ?? []) as Gatillo[];
}

// S6.3 / S6.4 — Devuelve gatillos activos y no vencidos, filtrados por ruta del lead
export async function obtenerGatillosActivos(ruta?: PipelineRuta): Promise<Gatillo[]> {
  const supabase = createServiceClient();
  const ahora = new Date().toISOString();

  const { data } = await supabase
    .from("gatillos")
    .select("*")
    .eq("activo", true)
    .or(`fecha_expiracion.is.null,fecha_expiracion.gt.${ahora}`);

  const todos = (data ?? []) as Gatillo[];
  if (!ruta) return todos;
  return todos.filter((g) => g.audiencia_objetivo === "all" || g.audiencia_objetivo === ruta);
}

// S6.2 — Activa o desactiva un gatillo
export async function toggleGatillo(id: string, activo: boolean): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("gatillos")
    .update({ activo, alerta_enviada: false })
    .eq("id", id);
  if (error) throw new Error(`[gatillos] Toggle error: ${error.message}`);
}

// S6.2 — Actualiza valor, fecha y audiencia de un gatillo
export async function actualizarGatillo(
  id: string,
  datos: { valor_actual?: string; fecha_expiracion?: string | null; audiencia_objetivo?: AudienciaGatillo }
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("gatillos").update(datos).eq("id", id);
  if (error) throw new Error(`[gatillos] Update error: ${error.message}`);
}

// S6.2 — Crea un gatillo personalizado
export async function crearGatillo(datos: {
  tipo: TipoGatillo;
  nombre: string;
  valor_actual: string;
  audiencia_objetivo: AudienciaGatillo;
  fecha_expiracion?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("gatillos").insert(datos);
  if (error) throw new Error(`[gatillos] Create error: ${error.message}`);
}

// S6.6 — Desactiva gatillos vencidos; detecta los que expiran en <24h para alertar
export async function verificarExpiracion(): Promise<{ vencidos: number; proximos: number }> {
  const supabase = createServiceClient();
  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Desactivar vencidos
  const { data: vencidos } = await supabase
    .from("gatillos")
    .update({ activo: false })
    .eq("activo", true)
    .lt("fecha_expiracion", ahora.toISOString())
    .select("id, nombre");

  // Detectar próximos a vencer (sin alerta enviada aún)
  const { data: proximos } = await supabase
    .from("gatillos")
    .select("id, nombre, fecha_expiracion")
    .eq("activo", true)
    .eq("alerta_enviada", false)
    .lt("fecha_expiracion", en24h)
    .not("fecha_expiracion", "is", null);

  if (proximos?.length) {
    const ids = proximos.map((g) => g.id);
    await supabase.from("gatillos").update({ alerta_enviada: true }).in("id", ids);
    console.warn(`[gatillos] Próximos a vencer: ${proximos.map((g) => g.nombre).join(", ")}`);
  }

  return { vencidos: vencidos?.length ?? 0, proximos: proximos?.length ?? 0 };
}

// S6.5 — IA analiza patrones de conversación y sugiere qué gatillos activar
export async function sugerirGatillos(): Promise<{ tipo: TipoGatillo; razon: string }[]> {
  const supabase = createServiceClient();

  const { data: mensajes } = await supabase
    .from("mensajes")
    .select("contenido, intencion_clasificada")
    .eq("direccion", "entrante")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!mensajes?.length) return [];

  const resumen = mensajes.map((m) => `[${m.intencion_clasificada ?? "otro"}] ${m.contenido}`).join("\n");

  const prompt = `Analiza estos mensajes recientes de leads de un centro de certificaciones CONOCER.
Identifica qué gatillos mentales de venta deberían activarse para aumentar conversiones.

Gatillos disponibles: escasez_cupo, escasez_evaluadores, urgencia_fecha, precio_vigente, evento_proximo, otro

Mensajes (los últimos 50):
${resumen.slice(0, 3000)}

Responde en JSON: [{"tipo": "escasez_cupo", "razon": "..."}]
Máximo 3 sugerencias. Solo sugiere los que tengan evidencia real en los mensajes.`;

  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { text: string }).text.trim();
    const json = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as { tipo: TipoGatillo; razon: string }[];
    return json;
  } catch {
    return [];
  }
}

// S6.3 — Formatea gatillos activos para inyectar en un prompt de IA
export function formatearGatillosParaPrompt(gatillos: Gatillo[]): string {
  if (gatillos.length === 0) return "";
  const lista = gatillos.map((g) => `- ${g.nombre}: "${g.valor_actual}"`).join("\n");
  return `\nGATILLOS ACTIVOS (incorpóralos orgánicamente si son relevantes — nunca los fuercen en cada mensaje):\n${lista}`;
}
