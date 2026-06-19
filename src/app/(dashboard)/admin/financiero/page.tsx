import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { listarPagos, resumenIngresos } from "@/services/pagos";
import { resumenComisiones } from "@/services/comisiones";
import { obtenerResumenGastoIA } from "@/services/alertas-ia";
import { NuevoPagoForm } from "./components/NuevoPagoForm";

export const metadata = { title: "Panel Financiero · ECMatic" };
export const revalidate = 0;

export default async function FinancieroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await createServiceClient()
    .from("profiles").select("rol").eq("id", user!.id).single();

  if (!profile || !["admin", "admin_financiero"].includes(profile.rol)) redirect("/dashboard");

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [pagos, resumen, comisiones, gastoIA, { data: leads }] = await Promise.all([
    listarPagos({ desde: inicioMes, hasta: finMes }),
    resumenIngresos(inicioMes, finMes),
    resumenComisiones(),
    obtenerResumenGastoIA(30),
    createServiceClient().from("leads").select("id, nombre, telefono").eq("activo", true).limit(200),
  ]);

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Panel Financiero — {ahora.toLocaleString("es-MX", { month: "long", year: "numeric" })}</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Ingresos del mes", value: fmt(resumen.total) },
          { label: "Pagos Stripe", value: fmt(resumen.porMetodo.stripe) },
          { label: "Pagos manuales", value: fmt(resumen.porMetodo.manual) },
          { label: "Total transacciones", value: resumen.totalPagos },
        ].map((k) => (
          <div key={k.label} className="rounded border bg-card p-4 text-center">
            <p className="text-xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Comisiones por vendedor */}
      <div>
        <p className="text-sm font-medium mb-2">Comisiones por vendedor</p>
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3 text-left">Vendedor</th>
                <th className="p-3 text-right">Pendiente</th>
                <th className="p-3 text-right">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {comisiones.map((c) => (
                <tr key={c.vendedorId} className="border-b">
                  <td className="p-3 font-medium">{c.nombre}</td>
                  <td className="p-3 text-right text-orange-600">{fmt(c.pendiente)}</td>
                  <td className="p-3 text-right text-green-600">{fmt(c.pagada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gasto IA */}
      <div className="rounded border p-4 space-y-1">
        <p className="text-sm font-medium">Gasto en APIs de IA — últimos 30 días</p>
        <p className="text-xs text-muted-foreground">Anthropic: ${gastoIA.anthropic.costoUSD.toFixed(4)} USD · OpenAI: ${gastoIA.openai.costoUSD.toFixed(4)} USD</p>
      </div>

      {/* Pagos del mes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Pagos registrados este mes ({pagos.length})</p>
          <NuevoPagoForm leads={(leads ?? []) as { id: string; nombre: string | null; telefono: string | null }[]} />
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3 text-left">Lead</th>
                <th className="p-3 text-left">Vendedor</th>
                <th className="p-3 text-right">Monto</th>
                <th className="p-3 text-center">Método</th>
                <th className="p-3 text-center">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pagos.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin pagos este mes</td></tr>}
              {pagos.map((p) => {
                const lead = p.leads as unknown as { nombre: string | null; telefono: string | null } | null;
                const vendedor = p.vendedores as unknown as { nombre: string } | null;
                return (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{lead?.nombre ?? lead?.telefono ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{vendedor?.nombre ?? "—"}</td>
                    <td className="p-3 text-right font-medium">{fmt(Number(p.monto))}</td>
                    <td className="p-3 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs ${p.metodo === "stripe" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"}`}>
                        {p.metodo}
                      </span>
                    </td>
                    <td className="p-3 text-center text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
