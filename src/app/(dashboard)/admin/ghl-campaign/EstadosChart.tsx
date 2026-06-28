import type { EstadosLeadsCampana } from "@/services/ghl-aprobacion";

const CONFIG = [
  { key: "noAlcanzados",    label: "Sin alcanzar aún",       color: "bg-slate-300 dark:bg-slate-600" },
  { key: "excluidos",       label: "Excluidos (ya comp./new)", color: "bg-purple-400" },
  { key: "sin_contactar",   label: "Enviados — sin respuesta", color: "bg-slate-500" },
  { key: "en_espera",       label: "En espera",               color: "bg-yellow-500" },
  { key: "en_conversacion", label: "En conversación",         color: "bg-blue-500" },
  { key: "cerrado",         label: "Cerrado / convertido",    color: "bg-green-500" },
  { key: "inactivo",        label: "Inactivo / negativo",     color: "bg-red-400" },
] as const;

type Key = (typeof CONFIG)[number]["key"];

interface Props {
  totalGHL: number;
  noAlcanzados: number;
  excluidos: number;
  estados: EstadosLeadsCampana;
}

export function EstadosChart({ totalGHL, noAlcanzados, excluidos, estados }: Props) {
  const valores: Record<Key, number> = {
    noAlcanzados,
    excluidos,
    sin_contactar:   estados.sin_contactar,
    en_espera:       estados.en_espera,
    en_conversacion: estados.en_conversacion,
    cerrado:         estados.cerrado,
    inactivo:        estados.inactivo,
  };

  if (totalGHL === 0) {
    return <p className="text-xs text-muted-foreground">Sin datos todavía.</p>;
  }

  return (
    <div className="space-y-2.5">
      {CONFIG.map(({ key, label, color }) => {
        const count = valores[key];
        const pct   = (count / totalGHL) * 100;
        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
            <span className="w-52 shrink-0 text-muted-foreground">{label}</span>
            <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
              <div className={`h-2.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 text-right font-semibold tabular-nums">
              {count.toLocaleString("es-MX")}
              <span className="text-muted-foreground font-normal ml-1">({pct.toFixed(0)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
