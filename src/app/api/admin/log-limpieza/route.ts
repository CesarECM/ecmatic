import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;
const DIAS_RETENCION = 7;

// GET /api/admin/log-limpieza — Vercel Cron diario: borra log_sistema > 7 días
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  const supabase = createServiceClient();
  const corte = new Date(Date.now() - DIAS_RETENCION * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { error, count } = await supabase
      .from("log_sistema")
      .delete({ count: "exact" })
      .lt("created_at", corte);

    if (error) throw error;

    void logSistema({
      categoria:   "cron",
      tipoAccion:  "cron.log-limpieza",
      fase:        "ok",
      resultado:   `${count ?? 0} registros eliminados (> ${DIAS_RETENCION} días)`,
      metadata:    { registros_eliminados: count ?? 0, corte_fecha: corte, duracion_ms: Date.now() - inicio },
    });

    return NextResponse.json({ ok: true, eliminados: count ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria:   "cron",
      tipoAccion:  "cron.log-limpieza",
      fase:        "error",
      resultado:   msg,
      metadata:    { error_message: msg, duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
