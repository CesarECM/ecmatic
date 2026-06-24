"use server";

import { logSistema } from "@/services/log-sistema";

// S35.1 — Dispara un CRON manualmente desde el panel de automatizaciones
export async function dispararCronAction(path: string): Promise<{ ok: boolean; mensaje: string }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    void logSistema({ categoria: "ui", tipoAccion: "automatizaciones.disparar-cron", fase: "error", resultado: "CRON_SECRET no configurado", metadata: { path } });
    return { ok: false, mensaje: "CRON_SECRET no configurado" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
  void logSistema({ categoria: "ui", tipoAccion: "automatizaciones.disparar-cron", fase: "inicio", metadata: { path } });
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      void logSistema({ categoria: "ui", tipoAccion: "automatizaciones.disparar-cron", fase: "ok", resultado: JSON.stringify(data).slice(0, 300), metadata: { path, status: res.status } });
      return { ok: true, mensaje: JSON.stringify(data) };
    }
    const mensaje = data.error ?? `HTTP ${res.status}`;
    void logSistema({ categoria: "ui", tipoAccion: "automatizaciones.disparar-cron", fase: "error", resultado: mensaje, metadata: { path, status: res.status } });
    return { ok: false, mensaje };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error de red";
    void logSistema({ categoria: "ui", tipoAccion: "automatizaciones.disparar-cron", fase: "error", resultado: mensaje, metadata: { path } });
    return { ok: false, mensaje };
  }
}
