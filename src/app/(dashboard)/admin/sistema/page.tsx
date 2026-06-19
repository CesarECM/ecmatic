import { verificarSalud } from "@/services/health";
import { obtenerResumenGastoIA } from "@/services/alertas-ia";
import { PanelLED } from "./components/PanelLED";

export const metadata = { title: "Estado del Sistema · ECMatic" };

export default async function SistemaPage() {
  const [indicadores, gastoIA] = await Promise.all([
    verificarSalud(),
    obtenerResumenGastoIA(30),
  ]);

  const totalGastoUSD = Object.values(gastoIA).reduce((s, v) => s + v.costoUSD, 0);
  const umbral = Number(process.env.IA_MONTHLY_BUDGET_USD ?? "50");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Estado del sistema</h1>
        <p className="text-sm text-muted-foreground">
          Monitor en tiempo real de todas las integraciones de ECMatic
        </p>
      </div>

      {/* S10.1 — Panel LED */}
      <PanelLED inicial={indicadores} />

      {/* S10.7 — Gasto IA */}
      <section className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Gasto en APIs de IA — últimos 30 días</p>
          <span className={`text-sm font-bold ${totalGastoUSD >= umbral ? "text-red-600" : "text-green-600"}`}>
            ${totalGastoUSD.toFixed(2)} / ${umbral} USD
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${totalGastoUSD >= umbral ? "bg-red-500" : "bg-green-500"}`}
            style={{ width: `${Math.min(100, (totalGastoUSD / umbral) * 100)}%` }}
          />
        </div>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>Anthropic: ${gastoIA.anthropic.costoUSD.toFixed(4)} USD ({(gastoIA.anthropic.tokens / 1000).toFixed(0)}K tokens)</span>
          <span>OpenAI: ${gastoIA.openai.costoUSD.toFixed(4)} USD ({(gastoIA.openai.tokens / 1000).toFixed(0)}K tokens)</span>
        </div>
      </section>

      {/* S10.2 — Info de alertas */}
      <section className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
        <p className="font-medium">Notificaciones críticas</p>
        <p className="text-muted-foreground">
          {process.env.ADMIN_WHATSAPP
            ? `Alertas activas → ${process.env.ADMIN_WHATSAPP}`
            : "⚠️ Agrega ADMIN_WHATSAPP en Vercel para recibir alertas críticas por WhatsApp"}
        </p>
      </section>
    </div>
  );
}
