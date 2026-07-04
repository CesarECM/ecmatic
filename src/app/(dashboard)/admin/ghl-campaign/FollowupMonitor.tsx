// MPS-28 S106 — Widget compacto del monitor de seguimientos.
// Muestra KPIs + alertas críticas + links a /admin/seguimientos y /admin/templates.
import Link from "next/link";
import type { SeguimientoKPIs } from "@/services/seguimiento-monitor";

const TIPO_COLORS: Record<string, string> = {
  nurturing:      "text-yellow-600 dark:text-yellow-400",
  conversational: "text-blue-600 dark:text-blue-400",
  payment:        "text-orange-600 dark:text-orange-400",
  demo_agendado:  "text-purple-600 dark:text-purple-400",
};

const TIPO_LABELS: Record<string, string> = {
  nurturing: "Nurturing", conversational: "Conversacional",
  payment: "Pago", demo_agendado: "Post-Demo",
};

function KpiChip({ label, value, alarm = false }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${alarm ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

export function FollowupMonitor({ kpis }: { kpis: SeguimientoKPIs }) {
  const totalAlertas = kpis.atascados + kpis.escalados;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">Seguimientos activos</h2>
        <div className="flex items-center gap-2">
          {totalAlertas > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400">
              {totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""}
            </span>
          )}
          {kpis.activos > 0 && totalAlertas === 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
              OK
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiChip label="Activos"      value={kpis.activos} />
        <KpiChip label="Atascados"    value={kpis.atascados}    alarm={kpis.atascados > 0} />
        <KpiChip label="Escalados"    value={kpis.escalados}    alarm={kpis.escalados > 0} />
        <KpiChip label="Intentos 24h" value={kpis.intentos_24h} />
      </div>

      {/* Desglose por tipo */}
      <div className="flex flex-wrap gap-4 text-xs">
        {(Object.entries(kpis.por_tipo) as [string, number][]).map(([tipo, n]) => (
          <span key={tipo}>
            <span className={`font-bold ${TIPO_COLORS[tipo] ?? ""}`}>{n}</span>
            <span className="text-muted-foreground ml-1">{TIPO_LABELS[tipo] ?? tipo}</span>
          </span>
        ))}
      </div>

      {/* Alertas críticas — solo si hay atascados o escalados */}
      {kpis.atascados > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            {kpis.atascados} seguimiento{kpis.atascados !== 1 ? "s" : ""} atascado{kpis.atascados !== 1 ? "s" : ""} — motor detenido, requieren atención manual
          </p>
        </div>
      )}
      {kpis.escalados > 0 && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            {kpis.escalados} escalado{kpis.escalados !== 1 ? "s" : ""} — agotaron intentos sin respuesta, acción manual requerida
          </p>
        </div>
      )}

      {kpis.activos === 0 && (
        <p className="text-xs text-muted-foreground">No hay seguimientos activos en este momento.</p>
      )}

      {/* Links de gestión */}
      <div className="flex gap-3 pt-1 border-t flex-wrap">
        <Link href="/admin/seguimientos"
          className="text-xs font-medium text-primary hover:underline">
          Ver seguimientos →
        </Link>
        <Link href="/admin/templates"
          className="text-xs font-medium text-primary hover:underline">
          Gestionar templates →
        </Link>
      </div>
    </div>
  );
}
