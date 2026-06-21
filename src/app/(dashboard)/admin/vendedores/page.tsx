import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { calcularMetricasVendedor } from "@/services/vendedor-metricas";
import { isConfigured } from "@/lib/google/calendar";
import { PesoInput } from "@/components/vendedores/peso-input";

export const revalidate = 0;

export default async function VendedoresPage() {
  const supabase = createServiceClient();
  const { data: vendedores } = await supabase
    .from("vendedores").select("id, nombre, email, activo, peso").order("nombre");

  const googleOk = isConfigured();
  const metricas = await Promise.all(
    (vendedores ?? []).map((v) => calcularMetricasVendedor(v.id))
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Equipo de vendedores</h1>
          <p className="text-sm text-muted-foreground">{vendedores?.length ?? 0} vendedores activos</p>
        </div>
        {!googleOk && (
          <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded border border-orange-200">
            Google Calendar no configurado — agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3 text-left">Vendedor</th>
              <th className="p-3 text-center">Citas (30d)</th>
              <th className="p-3 text-center">Show rate</th>
              <th className="p-3 text-center">Conversión</th>
              <th className="p-3 text-center">Peso (0–100)</th>
              <th className="p-3 text-center">Google Cal.</th>
              <th className="p-3 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(vendedores ?? []).map((v, i) => {
              const m = metricas[i];
              return (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-medium">{v.nombre}</p>
                    <p className="text-xs text-muted-foreground">{v.email}</p>
                  </td>
                  <td className="p-3 text-center">{m?.totalCitas ?? 0}</td>
                  <td className="p-3 text-center">
                    <span className={`font-medium ${(m?.showRate ?? 0) >= 0.6 ? "text-green-600" : "text-red-500"}`}>
                      {Math.round((m?.showRate ?? 0) * 100)}%
                    </span>
                  </td>
                  <td className="p-3 text-center">{Math.round((m?.tasaConversion ?? 0) * 100)}%</td>
                  <td className="p-3 text-center">
                    <PesoInput vendedorId={v.id} pesoInicial={v.peso ?? 50} />
                  </td>
                  <td className="p-3 text-center">
                    {googleOk
                      ? <a href={`/api/auth/google?vendedor_id=${v.id}`}
                          className="text-xs text-blue-600 hover:underline">Conectar</a>
                      : <span className="text-xs text-gray-400">N/A</span>}
                  </td>
                  <td className="p-3 text-center">
                    <Link href={`/admin/vendedores/${v.id}`}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50">
                      Ver métricas
                    </Link>
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
