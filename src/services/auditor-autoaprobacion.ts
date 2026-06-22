// S33.7 — Auditoría mensual del umbral adaptativo de auto-aprobación.
// Compara sugerencias auto-aprobadas contra efectividad y ajusta el umbral
// persistido en configuracion_sistema.metadata.umbral_autoaprobacion.

import { createServiceClient } from "@/lib/supabase/service";

const UMBRAL_MIN  = 0.75;
const UMBRAL_MAX  = 0.97;
const PASO_AJUSTE = 0.02;
const TASA_ALTA   = 0.80;  // si efectividad > 80% → bajar umbral (ser más permisivo)
const TASA_BAJA   = 0.60;  // si efectividad < 60% → subir umbral (ser más restrictivo)
const MUESTRA_MIN = 5;

export interface ResultadoAuditoriaUmbral {
  umbralAnterior: number;
  umbralNuevo: number;
  autoaprobadasEvaluadas: number;
  tasaEfectividad: number;
}

export async function auditarUmbralAutoaprobacion(): Promise<ResultadoAuditoriaUmbral> {
  const supabase = createServiceClient();

  const { data: config } = await (supabase as any)
    .from("configuracion_sistema")
    .select("metadata")
    .single();

  const umbralActual: number =
    (config?.metadata?.umbral_autoaprobacion as number | undefined) ?? 0.90;

  // Sugerencias auto-aprobadas en el último mes
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: autoaprobadas } = await (supabase as any)
    .from("sugerencias_ia")
    .select("id, metadata")
    .eq("aprobado", true)
    .gte("updated_at", hace30Dias)
    .contains("metadata", { autoaprobada: true });

  const total = (autoaprobadas ?? []).length;
  if (total < MUESTRA_MIN) {
    return { umbralAnterior: umbralActual, umbralNuevo: umbralActual, autoaprobadasEvaluadas: total, tasaEfectividad: 0 };
  }

  // Efectividad: no marcadas como revertidas
  const efectivas = (autoaprobadas as { metadata: Record<string, unknown> }[])
    .filter((s) => s.metadata?.revertida !== true).length;

  const tasa = efectivas / total;

  let umbralNuevo = umbralActual;
  if (tasa > TASA_ALTA) {
    umbralNuevo = Math.max(UMBRAL_MIN, +(umbralActual - PASO_AJUSTE).toFixed(2));
  } else if (tasa < TASA_BAJA) {
    umbralNuevo = Math.min(UMBRAL_MAX, +(umbralActual + PASO_AJUSTE).toFixed(2));
  }

  if (umbralNuevo !== umbralActual) {
    await (supabase as any)
      .from("configuracion_sistema")
      .update({
        metadata: { ...(config?.metadata ?? {}), umbral_autoaprobacion: umbralNuevo },
      });
  }

  return { umbralAnterior: umbralActual, umbralNuevo, autoaprobadasEvaluadas: total, tasaEfectividad: tasa };
}
