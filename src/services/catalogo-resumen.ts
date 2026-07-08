// MPS-32 S115.3 — Orquestador del resumen de catálogo IA.
// Siempre se llama fire-and-forget desde servicios.ts al crear o actualizar un servicio.

import { createServiceClient } from "@/lib/supabase/service";
import { generarResumenCatalogo } from "@/lib/ai/generar-resumen-catalogo";
import { logSistema } from "./log-sistema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function dispararResumenCatalogo(): Promise<void> {
  void logSistema({ categoria: "ia", tipoAccion: "resumen_catalogo", fase: "inicio" });

  try {
    const { data: servicios, error: fetchErr } = await db()
      .from("servicios")
      .select("titulo, estandar_conocer, nivel_estandar, modalidad, precio_centavos, duracion_horas, para_quien_es")
      .eq("activo", true)
      .order("precio_centavos", { ascending: false, nullsFirst: false });

    if (fetchErr) throw new Error(`fetch servicios: ${fetchErr.message}`);

    const resumen = await generarResumenCatalogo(servicios ?? []);

    const { data: cfg, error: cfgErr } = await db()
      .from("configuracion_sistema")
      .select("id")
      .single();
    if (cfgErr || !cfg) throw new Error(`read config: ${cfgErr?.message}`);

    const { error: upErr } = await db()
      .from("configuracion_sistema")
      .update({ resumen_catalogo: resumen, resumen_catalogo_at: new Date().toISOString() })
      .eq("id", cfg.id);

    if (upErr) throw new Error(`update config: ${upErr.message}`);

    void logSistema({
      categoria: "ia",
      tipoAccion: "resumen_catalogo",
      fase: "ok",
      metadata: { servicios_count: (servicios ?? []).length },
    });
  } catch (err) {
    void logSistema({
      categoria: "ia",
      tipoAccion: "resumen_catalogo",
      fase: "error",
      metadata: { error: String(err) },
    });
    console.error("[catalogo-resumen]", err);
  }
}
