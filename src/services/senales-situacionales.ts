// S19.6 — Motor de escaneo de señales situacionales en conversación.
// Detecta con IA señales contextuales (eventos, fechas, terceros, urgencia)
// y las persiste en lead_senales_situacionales para que S19.7 las use.

import { createServiceClient } from "@/lib/supabase/service";
import { detectarSenalesSituacionales, type SenalDetectada } from "@/lib/ai/senales-situacionales";

export type { SenalDetectada };

export interface SenalGuardada extends SenalDetectada {
  id: string;
  lead_id: string;
  activa: boolean;
  created_at: string;
}

// Escanea los mensajes recientes de un lead y persiste las señales detectadas.
// Desactiva señales previas del mismo tipo cuando detecta una nueva versión.
// Devuelve las señales recién guardadas (vacío si no se detectó nada).
export async function escanearSenalesSituacionales(
  leadId: string
): Promise<SenalGuardada[]> {
  const supabase = createServiceClient();

  const { data: mensajes } = await supabase
    .from("mensajes")
    .select("direccion, contenido")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!mensajes?.length) return [];

  // Detectar con IA (mensajes en orden cronológico para el contexto)
  const senalesDetectadas = await detectarSenalesSituacionales(
    [...mensajes].reverse()
  );

  if (!senalesDetectadas.length) return [];

  // Desactivar señales previas del mismo tipo para evitar duplicados activos
  const tiposDetectados = [...new Set(senalesDetectadas.map((s) => s.tipo))];
  await (supabase as any)
    .from("lead_senales_situacionales")
    .update({ activa: false })
    .eq("lead_id", leadId)
    .in("tipo", tiposDetectados)
    .eq("activa", true);

  // Insertar señales nuevas
  const filas = senalesDetectadas.map((s) => ({
    lead_id:     leadId,
    tipo:        s.tipo,
    descripcion: s.descripcion,
    fragmento:   s.fragmento,
    confianza:   s.confianza,
    activa:      true,
  }));

  const { data: insertadas, error } = await (supabase as any)
    .from("lead_senales_situacionales")
    .insert(filas)
    .select();

  if (error) {
    console.error("[senales] Error guardando señales:", error.message);
    return [];
  }

  return (insertadas ?? []) as SenalGuardada[];
}

// Devuelve las señales activas de un lead, ordenadas por confianza descendente.
export async function obtenerSenalesActivas(
  leadId: string
): Promise<SenalGuardada[]> {
  const { data } = await (createServiceClient() as any)
    .from("lead_senales_situacionales")
    .select("id, lead_id, tipo, descripcion, fragmento, confianza, activa, created_at")
    .eq("lead_id", leadId)
    .eq("activa", true)
    .order("confianza", { ascending: false });

  return (data ?? []) as SenalGuardada[];
}

// Formatea las señales activas en texto para incluir en un system prompt.
export function formatearSenalesParaPrompt(senales: SenalGuardada[]): string {
  if (!senales.length) return "";
  const lineas = senales.map(
    (s) => `- [${s.tipo.toUpperCase()}] ${s.descripcion} (confianza ${(s.confianza * 100).toFixed(0)}%)`
  );
  return `SEÑALES SITUACIONALES DETECTADAS:\n${lineas.join("\n")}`;
}

// Desactiva todas las señales activas de un lead (p.ej. al cerrarse el trato).
export async function limpiarSenales(leadId: string): Promise<void> {
  await (createServiceClient() as any)
    .from("lead_senales_situacionales")
    .update({ activa: false })
    .eq("lead_id", leadId)
    .eq("activa", true);
}
