"use server";

// S35.1 — Dispara un CRON manualmente desde el panel de automatizaciones
export async function dispararCronAction(path: string): Promise<{ ok: boolean; mensaje: string }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, mensaje: "CRON_SECRET no configurado" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, mensaje: JSON.stringify(data) };
    }
    return { ok: false, mensaje: data.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : "Error de red" };
  }
}
