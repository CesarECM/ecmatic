// GHL-9.8 / MPS-5 S39.4 — Cron cada 30 min: ejecuta follow-ups vencidos + detecta silencios.
// MPS-26: cascade de templates (Conectado → Aprobado → Sugerido → generar nuevo).
// La lógica de procesamiento vive en src/services/seguimiento-procesador.ts.
import { type NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";
import { obtenerVencidos } from "@/services/seguimiento-lead";
import { detectarSilencios } from "@/services/detectar-silencio";
import { obtenerStatsAprobacion } from "@/services/ghl-aprobacion";
import { createServiceClient } from "@/lib/supabase/service";
import { getFollowupConfig } from "@/services/followup-config";
import { procesarSeguimiento } from "@/services/seguimiento-procesador";

const CRON_SECRET  = process.env.CRON_SECRET;
const CDMX_OFFSET  = -6;

function horaEnCDMX(): number {
  return (new Date().getUTCHours() + 24 + CDMX_OFFSET) % 24;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const CAMPANA_ACTIVA = process.env.GHL_CAMPANA_ACTIVA ?? "sbc_jun26";
  const statsActiva = await obtenerStatsAprobacion(CAMPANA_ACTIVA);
  if (!statsActiva?.activa) {
    return NextResponse.json({ ok: true, motivo: "campana_inactiva" });
  }

  const traceId = crypto.randomUUID();
  const inicio  = Date.now();

  void logSistema({
    categoria: "cron", tipoAccion: "cron.seguimiento", fase: "inicio", traceId,
    resultado: "Iniciando cron de seguimiento adaptativo",
  });

  try {
    const [deteccion, vencidos] = await Promise.all([
      detectarSilencios(),
      obtenerVencidos(),
    ]);

    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento.vencidos", fase: "debug", traceId,
      resultado: `${vencidos.length} vencidos`,
      metadata: {
        ids:     vencidos.map((s) => s.id.slice(-8)),
        tipos:   vencidos.map((s) => s.tipo),
        niveles: vencidos.map((s) => s.nivel),
      },
    });

    let enviados         = 0;
    let directos_ghl     = 0;
    let pospuestos       = 0;
    let ya_en_cola       = 0;
    let pospuestos_fallo = 0;

    for (const seg of vencidos) {
      const config     = await getFollowupConfig(seg.tipo).catch(() => null);
      const horaInicio = config?.window_start ?? 9;
      const horaFin    = config?.window_end   ?? 22;

      if (horaEnCDMX() < horaInicio || horaEnCDMX() >= horaFin) {
        const manana = new Date();
        manana.setUTCDate(manana.getUTCDate() + 1);
        manana.setUTCHours(horaInicio - CDMX_OFFSET, 0, 0, 0);
        await db().from("seguimiento_lead").update({ proximo_at: manana.toISOString() }).eq("id", seg.id);
        pospuestos++;
        continue;
      }

      const res = await procesarSeguimiento(seg, traceId);
      if (res === "encolado")     enviados++;
      else if (res === "directo_ghl") directos_ghl++;
      else if (res === "ya_en_cola")  ya_en_cola++;
      else                            pospuestos_fallo++;
    }

    const resultado = {
      deteccion, vencidos: vencidos.length,
      enviados, directos_ghl, pospuestos, ya_en_cola, pospuestos_fallo,
      duracion_ms: Date.now() - inicio,
    };

    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento", fase: "ok", traceId,
      resultado: JSON.stringify(resultado), metadata: resultado,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron", tipoAccion: "cron.seguimiento", fase: "error", traceId,
      resultado: msg, metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
