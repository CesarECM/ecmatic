import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listarLlamadasVendedor, metricasLlamadasVendedor } from "@/services/llamadas";
import { registrarLlamadaAction } from "./actions";

export const revalidate = 0;

const BADGE_RESULTADO: Record<string, string> = {
  exitoso:      "bg-green-100 text-green-800",
  "no-contesta":"bg-yellow-100 text-yellow-800",
  seguimiento:  "bg-blue-100 text-blue-800",
  perdido:      "bg-red-100 text-red-800",
};

export default async function LlamadasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const svc = createServiceClient();
  const { data: vendedor } = await svc
    .from("vendedores").select("id, nombre").eq("profile_id", user!.id).single();

  if (!vendedor) {
    return <p className="p-6 text-sm text-muted-foreground">Tu cuenta no está vinculada a un vendedor.</p>;
  }

  const { data: leadsAsignados } = await svc
    .from("leads")
    .select("id, nombre, telefono, pipeline_stage")
    .eq("vendedor_id", vendedor.id)
    .eq("activo", true)
    .order("nombre");

  const [llamadas, metricas] = await Promise.all([
    listarLlamadasVendedor(vendedor.id),
    metricasLlamadasVendedor(vendedor.id),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Registro de Llamadas</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricaCard label="Total" valor={metricas.total} />
        <MetricaCard label="Exitosas" valor={metricas.exitosas} />
        <MetricaCard label="Tasa de éxito" valor={`${metricas.tasaExito}%`} />
        <MetricaCard label="Duración prom." valor={`${metricas.duracionPromedioMin} min`} />
      </div>

      {/* Formulario de registro */}
      <form action={registrarLlamadaAction} className="border rounded-lg p-4 space-y-4 bg-card">
        <h2 className="font-medium text-sm">Registrar nueva llamada</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Lead</label>
            <select name="lead_id" required className="w-full border rounded p-2 text-sm bg-background">
              <option value="">Selecciona un lead…</option>
              {(leadsAsignados ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre ?? l.telefono} — {l.pipeline_stage}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Objetivo</label>
            <select name="objetivo" required className="w-full border rounded p-2 text-sm bg-background">
              <option value="avance">Avance de embudo</option>
              <option value="cierre">Cierre de venta</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Resultado</label>
            <select name="resultado" required className="w-full border rounded p-2 text-sm bg-background">
              <option value="exitoso">Exitoso</option>
              <option value="seguimiento">Requiere seguimiento</option>
              <option value="no-contesta">No contesta</option>
              <option value="perdido">Lead perdido</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Duración (min)</label>
            <input
              name="duracion_min"
              type="number"
              min={1}
              max={180}
              placeholder="ej. 15"
              className="w-full border rounded p-2 text-sm bg-background"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Notas</label>
          <textarea
            name="notas"
            rows={2}
            placeholder="Compromisos adquiridos, objeciones, próximos pasos…"
            className="w-full border rounded p-2 text-sm bg-background resize-none"
          />
        </div>

        <button
          type="submit"
          className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium"
        >
          Guardar llamada
        </button>
      </form>

      {/* Historial */}
      <div className="space-y-2">
        <h2 className="font-medium text-sm">Historial reciente</h2>
        {llamadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin llamadas registradas aún.</p>
        ) : (
          <ul className="space-y-2">
            {llamadas.map((ll) => (
              <li key={ll.id} className="border rounded p-3 text-sm space-y-1 bg-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">
                    {(ll.leads as { nombre: string | null; telefono: string | null } | undefined)?.nombre
                      ?? (ll.leads as { nombre: string | null; telefono: string | null } | undefined)?.telefono
                      ?? "—"}
                  </span>
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">
                      {ll.objetivo === "cierre" ? "Cierre" : "Avance"}
                    </span>
                    {ll.resultado && (
                      <span className={`text-xs px-2 py-0.5 rounded ${BADGE_RESULTADO[ll.resultado] ?? "bg-gray-100"}`}>
                        {ll.resultado}
                      </span>
                    )}
                  </div>
                </div>
                {ll.notas && <p className="text-muted-foreground">{ll.notas}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(ll.created_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
                  {ll.duracion_min ? ` · ${ll.duracion_min} min` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MetricaCard({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="border rounded p-3 text-center bg-card">
      <p className="text-lg font-semibold">{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
