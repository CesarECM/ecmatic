// S35.1 — Registro de ejecuciones de CRONs para el panel de automatizaciones
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export interface EntradaCronLog {
  id: string;
  cron_name: string;
  ejecutado_at: string;
  resultado: Record<string, unknown> | null;
  detalle: string | null;
}

export async function registrarEjecucionCron(
  cronName: string,
  resultado: Record<string, unknown>,
  detalle?: string
): Promise<void> {
  await db()
    .from("cron_log")
    .insert({ cron_name: cronName, resultado, detalle: detalle ?? null });
}

// Devuelve la última ejecución de cada cron de la lista dada
export async function ultimasEjecuciones(
  cronNames: string[]
): Promise<Record<string, EntradaCronLog>> {
  const resultado: Record<string, EntradaCronLog> = {};
  if (!cronNames.length) return resultado;

  // Una consulta por cron, sin window functions
  await Promise.all(
    cronNames.map(async (name) => {
      const { data } = await db()
        .from("cron_log")
        .select("*")
        .eq("cron_name", name)
        .order("ejecutado_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) resultado[name] = data as EntradaCronLog;
    })
  );

  return resultado;
}
