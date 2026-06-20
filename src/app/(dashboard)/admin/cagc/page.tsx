import { analizarFasesCAGC, resumenAnalisis, type AnalisisFaseCAGC } from "@/services/auditoria-cagc";

export const metadata = { title: "Auditoría CAGC · ECMatic" };
export const revalidate = 0;

const SEV_STYLES: Record<AnalisisFaseCAGC["severidad"], { badge: string; row: string }> = {
  critico:    { badge: "bg-red-600 text-white",    row: "border-red-200 bg-red-50" },
  importante: { badge: "bg-orange-500 text-white", row: "border-orange-200 bg-orange-50" },
  leve:       { badge: "bg-yellow-400 text-yellow-900", row: "border-yellow-200 bg-yellow-50" },
  ok:         { badge: "bg-green-600 text-white",  row: "border-green-100 bg-white" },
};

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FaseRow({ f }: { f: AnalisisFaseCAGC }) {
  const sev = SEV_STYLES[f.severidad];
  const flags: string[] = [];
  if (f.esHuecoContenido)      flags.push("Sin KB");
  if (f.esHuecoPipeline)       flags.push("Sin pipeline");
  if (f.coberturaBajaContenido) flags.push("KB escaso");
  if (f.coberturaBajaVolumen)   flags.push("Bajo volumen");

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${sev.row}`}>
      {/* Header fila */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center shrink-0 font-mono">
            {f.faseNumero}
          </span>
          <div>
            <p className="text-sm font-medium leading-tight">{f.faseNombre}</p>
            <p className="text-xs text-muted-foreground">{f.faseNombreTecnico}</p>
          </div>
        </div>
        <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${sev.badge}`}>
          {f.severidad}
        </span>
      </div>

      {/* Barras de score */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <ScoreBar score={f.scoreContenido} label="Contenido KB" color={f.scoreContenido < 0.5 ? "bg-red-500" : f.scoreContenido < 1 ? "bg-amber-400" : "bg-green-500"} />
        <ScoreBar score={f.scoreVolumen}   label="Volumen leads" color={f.scoreVolumen   < 0.5 ? "bg-red-500" : f.scoreVolumen   < 1 ? "bg-amber-400" : "bg-green-500"} />
      </div>

      {/* Métricas y flags */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{f.leadsEnFase} leads (min {f.umbralLeads})</span>
          <span>{f.recursosKBcoincidentes} KB (min {f.umbralRecursos})</span>
          {f.leadsConPipeline > 0 && (
            <span className="text-green-700">{f.leadsConPipeline} con pipeline</span>
          )}
        </div>
        {flags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {flags.map((flag) => (
              <span key={flag} className="text-xs rounded border px-1.5 py-0.5 bg-white text-gray-600">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function CAGCPage() {
  const fases = await analizarFasesCAGC();
  const resumen = resumenAnalisis(fases);

  const scorePct = Math.round(resumen.scorePromedioTotal * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Auditoría CAGC</h1>
          <p className="text-sm text-muted-foreground">
            Cobertura de las 17 fases del modelo del comprador
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {resumen.huecosCriticos > 0 && (
            <span className="rounded px-2 py-1 bg-red-600 text-white font-medium">
              {resumen.huecosCriticos} crítico{resumen.huecosCriticos > 1 ? "s" : ""}
            </span>
          )}
          {resumen.huecosImportantes > 0 && (
            <span className="rounded px-2 py-1 bg-orange-500 text-white">
              {resumen.huecosImportantes} importante{resumen.huecosImportantes > 1 ? "s" : ""}
            </span>
          )}
          {resumen.coberturaBaja > 0 && (
            <span className="rounded px-2 py-1 bg-yellow-400 text-yellow-900">
              {resumen.coberturaBaja} leve{resumen.coberturaBaja > 1 ? "s" : ""}
            </span>
          )}
          <span className="rounded px-2 py-1 bg-green-100 text-green-800">
            {resumen.fasesOk} ok
          </span>
          <span className="rounded px-2 py-1 bg-gray-100 text-gray-700 font-mono">
            score {scorePct}%
          </span>
        </div>
      </div>

      {/* Score global */}
      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Score de cobertura global</span>
          <span className="font-mono text-lg">{scorePct}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-gray-200">
          <div
            className={`h-3 rounded-full transition-all ${scorePct >= 70 ? "bg-green-500" : scorePct >= 40 ? "bg-amber-400" : "bg-red-500"}`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {resumen.totalFases} fases · promedio de scores de contenido KB y volumen de leads por fase
        </p>
      </div>

      {/* Grid de fases */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {fases.map((f) => <FaseRow key={f.faseNumero} f={f} />)}
      </div>
    </div>
  );
}
