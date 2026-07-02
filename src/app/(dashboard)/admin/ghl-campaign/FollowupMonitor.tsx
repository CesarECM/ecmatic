import Link from "next/link";
import type { SeguimientoKPIs, SeguimientoRow } from "@/services/seguimiento-monitor";

const TIPO_LABEL: Record<string, string> = {
  nurturing:      "Nurturing",
  conversational: "Conversacional",
  payment:        "Pago",
  demo_agendado:  "Demo agendada",
};

const TIPO_COLOR: Record<string, string> = {
  nurturing:      "text-yellow-600 dark:text-yellow-400",
  conversational: "text-blue-600 dark:text-blue-400",
  payment:        "text-orange-600 dark:text-orange-400",
  demo_agendado:  "text-purple-600 dark:text-purple-400",
};

function formatMs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function horaCDMX(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span className={`text-xs font-medium ${TIPO_COLOR[tipo] ?? "text-muted-foreground"}`}>
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function KpiChip({ label, value, alarm = false }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${alarm ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

type Modo = "atascado" | "proximo" | "escalado";

function SegRow({ r, modo }: { r: SeguimientoRow; modo: Modo }) {
  const ahora = Date.now();

  return (
    <tr className="hover:bg-muted/30">
      <td className="p-2 max-w-[150px] truncate font-medium text-xs">
        {r.nombre ?? <span className="text-muted-foreground font-mono">{r.lead_id.slice(-8)}</span>}
      </td>
      <td className="p-2"><TipoBadge tipo={r.tipo} /></td>
      <td className="p-2 tabular-nums text-center text-xs text-muted-foreground">{r.nivel}</td>

      {modo === "atascado" && (
        <>
          <td className="p-2 text-red-500 font-medium tabular-nums text-xs">
            hace {formatMs(ahora - new Date(r.proximo_at).getTime())}
          </td>
          <td className="p-2">
            {!r.ghl_contact_id && (
              <span className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                sin GHL
              </span>
            )}
          </td>
        </>
      )}

      {modo === "proximo" && (
        <td className="p-2 text-muted-foreground tabular-nums text-xs">
          {horaCDMX(r.proximo_at)}
          <span className="ml-2 text-muted-foreground/60">({formatMs(new Date(r.proximo_at).getTime() - ahora)})</span>
        </td>
      )}

      {modo === "escalado" && (
        <td className="p-2 text-muted-foreground tabular-nums text-xs">
          {horaCDMX(r.updated_at)}
        </td>
      )}

      <td className="p-2 text-right">
        <Link
          href={`/admin/leads/${r.lead_id}`}
          className="text-xs text-primary hover:underline"
        >
          Ver →
        </Link>
      </td>
    </tr>
  );
}

function SegTable({ rows, modo, headers }: { rows: SeguimientoRow[]; modo: Modo; headers: string[] }) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left p-2 font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => <SegRow key={r.id} r={r} modo={modo} />)}
        </tbody>
      </table>
    </div>
  );
}

export function FollowupMonitor({ kpis, atascados, proximos, escalados }: {
  kpis: SeguimientoKPIs;
  atascados: SeguimientoRow[];
  proximos: SeguimientoRow[];
  escalados: SeguimientoRow[];
}) {
  const totalAlertas = kpis.atascados + kpis.escalados;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Monitor de seguimientos</h2>
        {totalAlertas > 0 ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400">
            {totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""}
          </span>
        ) : kpis.activos > 0 ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            OK
          </span>
        ) : null}
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
        <span>
          <span className="text-yellow-600 dark:text-yellow-400 font-bold">{kpis.por_tipo.nurturing}</span>
          <span className="text-muted-foreground ml-1">Nurturing</span>
        </span>
        <span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">{kpis.por_tipo.conversational}</span>
          <span className="text-muted-foreground ml-1">Conversacional</span>
        </span>
        <span>
          <span className="text-orange-600 dark:text-orange-400 font-bold">{kpis.por_tipo.payment}</span>
          <span className="text-muted-foreground ml-1">Pago</span>
        </span>
        <span>
          <span className="text-purple-600 dark:text-purple-400 font-bold">{kpis.por_tipo.demo_agendado}</span>
          <span className="text-muted-foreground ml-1">Demo agendada</span>
        </span>
      </div>

      {/* Alerta: atascados */}
      {atascados.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            Atascados — motor detenido en estos leads, requieren atención manual
          </p>
          <SegTable
            rows={atascados}
            modo="atascado"
            headers={["Nombre", "Tipo", "Niv.", "Vencido hace", "Flags", ""]}
          />
        </div>
      )}

      {/* Alerta: escalados */}
      {escalados.length > 0 && (
        <div className="space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            Escalados — agotaron intentos de pago sin respuesta, requieren acción manual
          </p>
          <SegTable
            rows={escalados}
            modo="escalado"
            headers={["Nombre", "Tipo", "Niv.", "Escalado en", ""]}
          />
        </div>
      )}

      {/* Próximos envíos */}
      {proximos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Próximos envíos programados
          </p>
          <SegTable
            rows={proximos}
            modo="proximo"
            headers={["Nombre", "Tipo", "Niv.", "Hora CDMX (en)", ""]}
          />
        </div>
      )}

      {kpis.activos === 0 && (
        <p className="text-xs text-muted-foreground">No hay seguimientos activos en este momento.</p>
      )}
    </div>
  );
}
