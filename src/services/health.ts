import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { logSistema } from "@/services/log-sistema";

export type EstadoSalud = "ok" | "degraded" | "error";

export interface IndicadorSalud {
  nombre: string;
  estado: EstadoSalud;
  mensaje: string;
  timestamp: string;
}

// S10.1 — Verifica el estado de cada integración
export async function verificarSalud(): Promise<IndicadorSalud[]> {
  const ts = new Date().toISOString();
  const checks = await Promise.allSettled([
    checkSupabase(ts),
    checkWhatsApp(ts),
    checkAnthropic(ts),
    checkOpenAI(ts),
    checkResend(ts),
    checkBrevo(ts),
    checkStripe(ts),
    checkSmartBuilder(ts),
  ]);
  return checks.map((r) => r.status === "fulfilled" ? r.value : {
    nombre: "Desconocido", estado: "error" as EstadoSalud,
    mensaje: "Error inesperado en check", timestamp: ts,
  });
}

async function checkSupabase(ts: string): Promise<IndicadorSalud> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);
    return { nombre: "Supabase", estado: error ? "error" : "ok",
      mensaje: error ? error.message : "Conectado", timestamp: ts };
  } catch (e) {
    return { nombre: "Supabase", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkWhatsApp(ts: string): Promise<IndicadorSalud> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { nombre: "WhatsApp", estado: "degraded", mensaje: "Sin credenciales", timestamp: ts };
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    if (data.id) return { nombre: "WhatsApp", estado: "ok", mensaje: "API activa", timestamp: ts };
    return { nombre: "WhatsApp", estado: "error", mensaje: data.error?.message ?? "Error", timestamp: ts };
  } catch (e) {
    return { nombre: "WhatsApp", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkAnthropic(ts: string): Promise<IndicadorSalud> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { nombre: "Anthropic IA", estado: "degraded", mensaje: "Sin API key", timestamp: ts };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    return { nombre: "Anthropic IA", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "Anthropic IA", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkOpenAI(ts: string): Promise<IndicadorSalud> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { nombre: "OpenAI (embeddings)", estado: "degraded", mensaje: "Sin API key", timestamp: ts };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { nombre: "OpenAI (embeddings)", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "OpenAI (embeddings)", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkResend(ts: string): Promise<IndicadorSalud> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { nombre: "Resend (email)", estado: "degraded", mensaje: "Sin API key", timestamp: ts };
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { nombre: "Resend (email)", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "Resend (email)", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkBrevo(ts: string): Promise<IndicadorSalud> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { nombre: "Brevo (nurturing)", estado: "degraded", mensaje: "Sin API key", timestamp: ts };
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": key },
    });
    return { nombre: "Brevo (nurturing)", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "Brevo (nurturing)", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkStripe(ts: string): Promise<IndicadorSalud> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { nombre: "Stripe (pagos)", estado: "degraded", mensaje: "Sin API key", timestamp: ts };
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { nombre: "Stripe (pagos)", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "Stripe (pagos)", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

async function checkSmartBuilder(ts: string): Promise<IndicadorSalud> {
  const url = process.env.SMARTBUILDER_API_URL;
  const key = process.env.SMARTBUILDER_API_KEY;
  if (!url || !key) return { nombre: "SmartBuilderEC", estado: "degraded", mensaje: "Sin credenciales", timestamp: ts };
  try {
    const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${key}` } });
    return { nombre: "SmartBuilderEC", estado: res.ok ? "ok" : "error",
      mensaje: res.ok ? "Activo" : `HTTP ${res.status}`, timestamp: ts };
  } catch (e) {
    return { nombre: "SmartBuilderEC", estado: "error", mensaje: String(e), timestamp: ts };
  }
}

// S10.2 — Envía alertas por WA cuando algún indicador pasa a rojo
export async function alertarIntegracionesRojas(indicadores: IndicadorSalud[]): Promise<void> {
  const adminWa = process.env.ADMIN_WHATSAPP;
  if (!adminWa) return;

  const rojos = indicadores.filter((i) => i.estado === "error");
  if (!rojos.length) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";
  const msg = `🔴 Alerta ECMatic — Integraciones con error:\n${rojos.map((r) => `• ${r.nombre}: ${r.mensaje}`).join("\n")}\n\n🔗 ${appUrl}/admin/sistema`;

  try {
    await sendTextMessage(adminWa, msg);
    void logSistema({
      categoria:  "servicio",
      tipoAccion: "sistema.alerta-wa",
      fase:       "ok",
      resultado:  `Alerta enviada: ${rojos.length} integración(es) en error`,
      metadata:   { integraciones_error: rojos.map(r => ({ nombre: r.nombre, mensaje: r.mensaje })), destino: adminWa },
    });
  } catch (err) {
    console.error("[alertarIntegracionesRojas]", err);
    void logSistema({
      categoria:  "servicio",
      tipoAccion: "sistema.alerta-wa",
      fase:       "error",
      resultado:  err instanceof Error ? err.message : String(err),
      metadata:   { integraciones_error: rojos.map(r => r.nombre), error_message: String(err) },
    });
  }
}
