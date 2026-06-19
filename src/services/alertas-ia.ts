import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";

// Precios estimados por 1M tokens (USD)
const PRECIO = {
  anthropic: { entrada: 3.0, salida: 15.0 },
  openai:    { entrada: 0.02, salida: 0.02 },
};

// S8.8 — Registra uso de tokens IA para estimación de costos
export async function registrarUsoIA(
  proveedor: "anthropic" | "openai",
  tokensEntrada: number,
  tokensSalida: number
): Promise<void> {
  const p = PRECIO[proveedor];
  const costoEstimado = (tokensEntrada / 1_000_000) * p.entrada + (tokensSalida / 1_000_000) * p.salida;

  const supabase = createServiceClient();
  await supabase.from("uso_ia").insert({
    proveedor,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
    costo_estimado: Number(costoEstimado.toFixed(6)),
  }).then(({ error }) => {
    if (error) console.error("[alertas-ia] Error registrando uso:", error.message);
  });
}

// S8.8 — Calcula gasto del mes actual y alerta si supera el umbral
export async function verificarPresupuestoIA(): Promise<{ gastoUSD: number; alertaEnviada: boolean }> {
  const supabase = createServiceClient();
  const inicioMes = new Date();
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("uso_ia")
    .select("costo_estimado")
    .gte("fecha", inicioMes.toISOString().split("T")[0]);

  const gastoUSD = (data ?? []).reduce((s, r) => s + Number(r.costo_estimado), 0);
  const umbral = Number(process.env.IA_MONTHLY_BUDGET_USD ?? "50");

  if (gastoUSD >= umbral) {
    const adminWa = process.env.ADMIN_WHATSAPP;
    if (adminWa) {
      try {
        await sendTextMessage(adminWa,
          `⚠️ Alerta ECMatic: gasto en APIs de IA este mes: $${gastoUSD.toFixed(2)} USD (límite $${umbral} USD)`);
        return { gastoUSD, alertaEnviada: true };
      } catch { /* no bloquear */ }
    }
  }
  return { gastoUSD, alertaEnviada: false };
}

// S8.8 — Resumen de gasto por proveedor para el panel financiero
export async function obtenerResumenGastoIA(dias = 30) {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data } = await supabase
    .from("uso_ia")
    .select("proveedor, tokens_entrada, tokens_salida, costo_estimado")
    .gte("fecha", desde);

  const resumen: Record<string, { tokens: number; costoUSD: number }> = {
    anthropic: { tokens: 0, costoUSD: 0 },
    openai:    { tokens: 0, costoUSD: 0 },
  };

  for (const r of data ?? []) {
    resumen[r.proveedor].tokens += r.tokens_entrada + r.tokens_salida;
    resumen[r.proveedor].costoUSD += Number(r.costo_estimado);
  }
  return resumen;
}
