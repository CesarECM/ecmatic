import { type NextRequest, NextResponse } from "next/server";
import { ejecutarProtocolosPendientes } from "@/services/ejecutor-protocolos";
import { logSistema } from "@/services/log-sistema";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inicio = Date.now();
  void logSistema({
    categoria: "cron",
    tipoAccion: "cron.protocolos-ejecutar",
    fase: "inicio",
    resultado: "Iniciando ejecución de protocolos pendientes",
  });

  try {
    const resultado = await ejecutarProtocolosPendientes();
    void logSistema({
      categoria: "cron",
      tipoAccion: "cron.protocolos-ejecutar",
      fase: "ok",
      resultado: JSON.stringify(resultado),
      metadata: { ...resultado, duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    void logSistema({
      categoria: "cron",
      tipoAccion: "cron.protocolos-ejecutar",
      fase: "error",
      resultado: msg,
      metadata: { duracion_ms: Date.now() - inicio },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
