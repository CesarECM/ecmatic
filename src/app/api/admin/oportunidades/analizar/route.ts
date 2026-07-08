// MPS-34 S120.3 — Endpoint que ejecuta el ciclo completo de análisis IA del panel.
// POST /api/admin/oportunidades/analizar
// Protegido por CRON_SECRET o por sesión admin (llamado desde el frontend).
// 1. Si el panel tiene < 10 leads, selecciona candidatos con Haiku.
// 2. Analiza cada lead del panel con Sonnet.

import { NextResponse } from "next/server";
import { seleccionarCandidatosPanel } from "@/lib/ai/seleccionar-candidatos-panel";
import { prepararLeadsParaAnalisis, analizarOportunidades } from "@/lib/ai/analizar-oportunidades";
import { logSistema } from "@/services/log-sistema";
import { createServiceClient } from "@/lib/supabase/service";

async function verificarAdmin(req: Request): Promise<boolean> {
  // Acepta CRON_SECRET (llamadas desde cron o CI)
  const secret = req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");
  if (secret === process.env.CRON_SECRET) return true;

  // Acepta sesión activa de admin (llamada desde el frontend)
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (createServiceClient() as any)
      .from("profiles").select("rol").eq("id", user.id).single();
    return profile?.rol === "admin";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!await verificarAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  void logSistema({
    categoria: "ia", tipoAccion: "oportunidades.analizar",
    fase: "inicio", resultado: "Ciclo de análisis iniciado",
  });

  try {
    // Paso 1: llenar slots vacíos si el panel tiene < 10 leads
    const { agregados } = await seleccionarCandidatosPanel();

    // Paso 2: analizar todos los leads activos del panel
    const leadsParaAnalisis = await prepararLeadsParaAnalisis();
    const { exitosos, errores } = await analizarOportunidades(leadsParaAnalisis);

    void logSistema({
      categoria: "ia", tipoAccion: "oportunidades.analizar",
      fase: "ok",
      resultado: `${exitosos} analizados, ${errores} errores, ${agregados} nuevos`,
    });

    return NextResponse.json({ ok: true, exitosos, errores, agregados });
  } catch (err) {
    void logSistema({
      categoria: "ia", tipoAccion: "oportunidades.analizar",
      fase: "error",
      resultado: err instanceof Error ? err.message.slice(0, 200) : "Error",
    });
    return NextResponse.json({ error: "Error en análisis IA" }, { status: 500 });
  }
}
