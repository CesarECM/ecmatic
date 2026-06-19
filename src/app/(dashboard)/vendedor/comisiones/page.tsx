import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listarComisiones } from "@/services/comisiones";

export const revalidate = 0;

export default async function ComisionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const svc = createServiceClient();
  const { data: vendedor } = await svc
    .from("vendedores").select("id, nombre").eq("profile_id", user!.id).single();

  if (!vendedor) {
    return <p className="text-sm text-muted-foreground p-6">Tu cuenta no está vinculada a un vendedor.</p>;
  }

  const comisiones = await listarComisiones(vendedor.id);
  const pendiente = comisiones.filter((c) => c.estado === "pendiente")
    .reduce((s, c) => s + Number(c.monto_comision), 0);
  const pagada = comisiones.filter((c) => c.estado === "pagada")
    .reduce((s, c) => s + Number(c.monto_comision), 0);

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-semibold">Mis comisiones — {vendedor.nombre}</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{fmt(pendiente)}</p>
          <p className="text-xs text-muted-foreground mt-1">Por cobrar</p>
        </div>
        <div className="rounded border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{fmt(pagada)}</p>
          <p className="text-xs text-muted-foreground mt-1">Cobradas</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-right">Comisión</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Fecha pago</th>
            </tr>
          </thead>
          <tbody>
            {comisiones.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin comisiones registradas</td></tr>
            )}
            {comisiones.map((c) => {
              const pago = c.pagos as unknown as { leads: { nombre: string | null } | null } | null;
              const lead = pago?.leads;
              return (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{lead?.nombre ?? "—"}</td>
                  <td className="p-3 text-right font-medium">{fmt(Number(c.monto_comision))}</td>
                  <td className="p-3 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs ${c.estado === "pagada" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                      {c.estado === "pagada" ? "Cobrada" : "Pendiente"}
                    </span>
                  </td>
                  <td className="p-3 text-center text-xs text-muted-foreground">
                    {c.fecha_pago ? new Date(c.fecha_pago).toLocaleDateString("es-MX") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
