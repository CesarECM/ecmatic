import { createServiceClient } from "@/lib/supabase/service";
import { listarExperimentos } from "@/services/experimentos";
import { ReporteKB } from "./components/ReporteKB";
import { crearExperimentoAction, declararGanadorAction } from "./actions";

export const metadata = { title: "Analítica · ECMatic" };
export const revalidate = 0;

const fmt = (centavos: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(centavos / 100);

export default async function AnaliticaPage() {
  const supabase = createServiceClient();

  const [experimentos, { data: competidores }, { data: calidades }] = await Promise.all([
    listarExperimentos(),
    supabase.from("competidores").select("*").order("menciones", { ascending: false }).limit(10),
    supabase.from("calidad_conversacional")
      .select("score_total, ganada, created_at, vendedores(nombre)")
      .order("created_at", { ascending: false }).limit(20),
  ]);

  const promedioCalidad = calidades?.length
    ? Math.round(calidades.reduce((s, c) => s + c.score_total, 0) / calidades.length)
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Analítica avanzada</h1>

      {/* S11.2 — Calidad conversacional */}
      {calidades && calidades.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">Calidad conversacional</p>
            {promedioCalidad !== null && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${promedioCalidad >= 70 ? "bg-green-100 text-green-700" : promedioCalidad >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                Promedio: {promedioCalidad}/100
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-center">Score</th>
                  <th className="p-2 text-center">Resultado</th>
                  <th className="p-2 text-center">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {calidades.slice(0, 8).map((c) => {
                  const vendedor = c.vendedores as unknown as { nombre: string } | null;
                  return (
                    <tr key={`${c.created_at}`} className="border-b hover:bg-gray-50">
                      <td className="p-2">{vendedor?.nombre ?? "IA"}</td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${c.score_total >= 70 ? "text-green-600" : c.score_total >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                          {c.score_total}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${c.ganada ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {c.ganada ? "Ganada" : "Perdida"}
                        </span>
                      </td>
                      <td className="p-2 text-center text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("es-MX")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* S11.6 — Inteligencia de competidores */}
      {(competidores ?? []).length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-medium">Inteligencia de competidores</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {(competidores ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border p-3">
                <div>
                  <p className="text-sm font-medium capitalize">{c.nombre}</p>
                  {c.ultima_mencion && (
                    <p className="text-xs text-muted-foreground">
                      Última mención: {new Date(c.ultima_mencion).toLocaleDateString("es-MX")}
                    </p>
                  )}
                </div>
                <span className="text-lg font-bold text-orange-600">{c.menciones}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* S11.4 — Experimentos de precios */}
      <section className="space-y-3">
        <p className="text-sm font-medium">Experimentos de precio A/B</p>
        {experimentos.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin experimentos activos.</p>
        )}
        {experimentos.map((e) => {
          const tasaA = e.asignaciones_a > 0 ? (e.conversiones_a / e.asignaciones_a * 100).toFixed(1) : "0";
          const tasaB = e.asignaciones_b > 0 ? (e.conversiones_b / e.asignaciones_b * 100).toFixed(1) : "0";
          return (
            <div key={e.id} className="rounded border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{e.nombre}</p>
                <span className={`text-xs rounded px-2 py-0.5 ${e.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {e.ganador ? `Ganador: ${e.ganador.toUpperCase()}` : e.activo ? "Activo" : "Terminado"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`rounded p-2 border ${e.ganador === "a" ? "border-green-400 bg-green-50" : ""}`}>
                  <p className="font-medium">Grupo A — {fmt(e.precio_a_centavos)}</p>
                  <p className="text-xs text-muted-foreground">{e.asignaciones_a} asignados · {e.conversiones_a} conv. · {tasaA}%</p>
                </div>
                <div className={`rounded p-2 border ${e.ganador === "b" ? "border-green-400 bg-green-50" : ""}`}>
                  <p className="font-medium">Grupo B — {fmt(e.precio_b_centavos)}</p>
                  <p className="text-xs text-muted-foreground">{e.asignaciones_b} asignados · {e.conversiones_b} conv. · {tasaB}%</p>
                </div>
              </div>
              {e.activo && !e.ganador && (
                <div className="flex gap-2">
                  <form action={declararGanadorAction.bind(null, e.id, "a")}>
                    <button type="submit" className="text-xs rounded border px-2 py-1 hover:bg-gray-50">Declarar A ganador</button>
                  </form>
                  <form action={declararGanadorAction.bind(null, e.id, "b")}>
                    <button type="submit" className="text-xs rounded border px-2 py-1 hover:bg-gray-50">Declarar B ganador</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}

        <details className="rounded border p-3">
          <summary className="text-xs text-blue-600 cursor-pointer">+ Crear nuevo experimento</summary>
          <form action={crearExperimentoAction} className="mt-3 space-y-2">
            <input name="nombre" required placeholder="Nombre del experimento" className="w-full rounded border px-2 py-1 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input name="precio_a" type="number" step="0.01" required placeholder="Precio A (MXN)" className="rounded border px-2 py-1 text-sm" />
              <input name="precio_b" type="number" step="0.01" required placeholder="Precio B (MXN)" className="rounded border px-2 py-1 text-sm" />
            </div>
            <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Crear</button>
          </form>
        </details>
      </section>

      {/* S11.7 — Reporte KB */}
      <section className="rounded border p-4">
        <ReporteKB />
      </section>
    </div>
  );
}
