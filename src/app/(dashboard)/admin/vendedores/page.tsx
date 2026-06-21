import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { calcularMetricasVendedor, type MetricasVendedor } from "@/services/vendedor-metricas";
import { isConfigured } from "@/lib/google/calendar";
import { PesoInput } from "@/components/vendedores/peso-input";
import { AgregarVendedorBtn } from "@/components/vendedores/agregar-vendedor-btn";
import { ReenviarBtn } from "@/components/vendedores/reenviar-btn";

export const revalidate = 0;

const METRICAS_VACÍAS: MetricasVendedor = {
  vendedorId: "",
  totalCitas: 0, shows: 0, noShows: 0, showRate: 0,
  conversiones: 0, tasaConversion: 0, promesasVencidas: 0, transcriptosSubidos: 0,
};

export default async function VendedoresPage() {
  const supabase = createServiceClient();

  // Intentar con peso; si la columna no existe aún, fallback sin ella
  let { data: vendedores } = await supabase
    .from("vendedores")
    .select("id, profile_id, nombre, email, activo, peso")
    .order("nombre");

  if (!vendedores) {
    const { data: fallback } = await supabase
      .from("vendedores")
      .select("id, profile_id, nombre, email, activo")
      .order("nombre");
    vendedores = (fallback ?? []).map((v) => ({ ...v, peso: 50 }));
  }

  // Tokens de Google Calendar — qué vendedores ya tienen conexión activa
  const { data: tokens } = await supabase
    .from("vendedor_tokens")
    .select("vendedor_id, expires_at");
  const conectados = new Set((tokens ?? []).map((t) => t.vendedor_id));

  // Detectar invitaciones pendientes — falla silenciosamente si el admin API no responde
  let pendientes = new Set<string>();
  try {
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    pendientes = new Set(
      (authData?.users ?? [])
        .filter((u) => !u.email_confirmed_at)
        .map((u) => u.id)
    );
  } catch {
    // omitir indicadores de pendiente si falla
  }

  const googleOk = isConfigured();

  // Métricas — falla silenciosamente por vendedor si hay error
  const metricas = await Promise.all(
    (vendedores ?? []).map((v) =>
      calcularMetricasVendedor(v.id).catch(() => ({ ...METRICAS_VACÍAS, vendedorId: v.id }))
    )
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Equipo de vendedores</h1>
          <p className="text-sm text-muted-foreground">{vendedores?.length ?? 0} vendedores</p>
        </div>
        <div className="flex items-center gap-3">
          {!googleOk && (
            <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded border border-orange-200">
              Google Calendar no configurado
            </span>
          )}
          <AgregarVendedorBtn />
        </div>
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
              const m = metricas[i] ?? METRICAS_VACÍAS;
              const esPendiente = v.profile_id ? pendientes.has(v.profile_id) : false;
              return (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{v.nombre}</p>
                      {esPendiente && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Pendiente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{v.email}</p>
                    {esPendiente && <ReenviarBtn email={v.email} />}
                  </td>
                  <td className="p-3 text-center">{m.totalCitas}</td>
                  <td className="p-3 text-center">
                    <span className={`font-medium ${m.showRate >= 0.6 ? "text-green-600" : "text-red-500"}`}>
                      {Math.round(m.showRate * 100)}%
                    </span>
                  </td>
                  <td className="p-3 text-center">{Math.round(m.tasaConversion * 100)}%</td>
                  <td className="p-3 text-center">
                    <PesoInput vendedorId={v.id} pesoInicial={v.peso ?? 50} />
                  </td>
                  <td className="p-3 text-center">
                    {!googleOk
                      ? <span className="text-xs text-gray-400">N/A</span>
                      : conectados.has(v.id)
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                            Conectado
                          </span>
                        : <a href={`/api/auth/google?vendedor_id=${v.id}`}
                            className="text-xs text-blue-600 hover:underline">Conectar</a>
                    }
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
