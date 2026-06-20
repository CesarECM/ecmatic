// S21.1 — Votos de calidad sobre respuestas IA (bueno/malo + comentario libre).
// Un voto por mensaje; el último reemplaza al anterior (upsert por mensaje_id).

import { createServiceClient } from "@/lib/supabase/service";

export type TipoVoto = "bueno" | "malo";

export interface VotoRespuesta {
  id: string;
  mensaje_id: string;
  voto: TipoVoto;
  comentario: string | null;
  created_at: string;
}

export async function registrarVoto(
  mensajeId: string,
  voto: TipoVoto,
  comentario?: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("votos_respuesta")
    .upsert(
      { mensaje_id: mensajeId, voto, comentario: comentario ?? null },
      { onConflict: "mensaje_id" }
    );
  if (error) throw new Error(`[votos] Error registrando voto: ${error.message}`);
}

export async function obtenerVoto(mensajeId: string): Promise<VotoRespuesta | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("votos_respuesta")
    .select("*")
    .eq("mensaje_id", mensajeId)
    .maybeSingle();
  return (data as VotoRespuesta) ?? null;
}

export interface ResumenVotos {
  buenos: number;
  malos: number;
  total: number;
  tasa_buena: number; // 0–1
}

export async function resumirVotos(desde?: string): Promise<ResumenVotos> {
  const supabase = createServiceClient();
  let query = supabase.from("votos_respuesta").select("voto");
  if (desde) query = query.gte("created_at", desde);
  const { data } = await query;

  const buenos = (data ?? []).filter((v) => v.voto === "bueno").length;
  const malos  = (data ?? []).filter((v) => v.voto === "malo").length;
  const total  = buenos + malos;
  return { buenos, malos, total, tasa_buena: total > 0 ? buenos / total : 0 };
}
