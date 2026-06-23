// S35.4 — Panel de Thompson Sampling para tests A/B de pipeline
interface AbTest {
  id: string;
  nombre: string;
  etapa_nombre: string;
  ruta: string;
  asignaciones_a: number;
  conversiones_a: number;
  asignaciones_b: number;
  conversiones_b: number;
  activo: boolean;
  ganador: "a" | "b" | "benchmark" | null;
}

function tasa(conv: number, asig: number) {
  return asig > 0 ? ((conv / asig) * 100).toFixed(1) : "0.0";
}

// Media de Beta(α, β) = α / (α + β)
function mediaTheta(conv: number, asig: number) {
  const alpha = conv + 1;
  const beta = asig - conv + 1;
  return alpha / (alpha + beta);
}

function BarraComparativa({ thetaA, thetaB }: { thetaA: number; thetaB: number }) {
  const total = thetaA + thetaB || 1;
  const pctA = Math.round((thetaA / total) * 100);
  return (
    <div className="flex h-2 rounded-full overflow-hidden">
      <div className="bg-blue-400" style={{ width: `${pctA}%` }} />
      <div className="bg-orange-400 flex-1" />
    </div>
  );
}

interface Props { tests: AbTest[] }

export function PipelineAbDashboard({ tests }: Props) {
  if (!tests.length) {
    return <p className="text-xs text-muted-foreground">Sin tests A/B activos.</p>;
  }

  return (
    <div className="space-y-3">
      {tests.map((t) => {
        const thetaA = mediaTheta(t.conversiones_a, t.asignaciones_a);
        const thetaB = mediaTheta(t.conversiones_b, t.asignaciones_b);
        const liderando = thetaA >= thetaB ? "A" : "B";

        return (
          <div key={t.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="font-medium text-sm">{t.nombre}</p>
                <p className="text-xs text-muted-foreground">{t.etapa_nombre} · {t.ruta}</p>
              </div>
              <span className={`text-xs rounded px-2 py-0.5 ${
                t.ganador ? "bg-green-100 text-green-700"
                : t.activo ? "bg-blue-50 text-blue-700"
                : "bg-gray-100 text-gray-600"
              }`}>
                {t.ganador ? `Ganador: ${t.ganador.toUpperCase()}` : t.activo ? "Activo" : "Cerrado"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`rounded border p-2.5 ${t.ganador === "a" ? "border-green-400 bg-green-50" : ""}`}>
                <p className="font-semibold text-blue-700 mb-1">Variante A</p>
                <p>{t.asignaciones_a} asignados · {t.conversiones_a} conv.</p>
                <p className="font-mono text-sm mt-0.5">{tasa(t.conversiones_a, t.asignaciones_a)}%</p>
                <p className="text-muted-foreground mt-1">θ̄ = {(thetaA * 100).toFixed(1)}%</p>
              </div>
              <div className={`rounded border p-2.5 ${t.ganador === "b" ? "border-green-400 bg-green-50" : ""}`}>
                <p className="font-semibold text-orange-700 mb-1">Variante B</p>
                <p>{t.asignaciones_b} asignados · {t.conversiones_b} conv.</p>
                <p className="font-mono text-sm mt-0.5">{tasa(t.conversiones_b, t.asignaciones_b)}%</p>
                <p className="text-muted-foreground mt-1">θ̄ = {(thetaB * 100).toFixed(1)}%</p>
              </div>
            </div>

            {!t.ganador && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>A lidera</span>
                  <span className="font-medium">Thompson Sampling: {liderando} preferida</span>
                  <span>B lidera</span>
                </div>
                <BarraComparativa thetaA={thetaA} thetaB={thetaB} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
