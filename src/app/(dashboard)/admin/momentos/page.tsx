import { listarMomentos } from "@/services/momentos-cierre";

const OBJECIONES = ["precio", "tiempo", "no_sirva", "titulo", "pensarlo", "otro"];

interface Props {
  searchParams: Promise<{ objecion?: string; resultado?: string }>;
}

export default async function MomentosPage({ searchParams }: Props) {
  const params = await searchParams;

  const filtros = {
    objecionTipo: params.objecion,
    seCerro: params.resultado === "cerro" ? true : params.resultado === "perdio" ? false : undefined,
  };

  const momentos = await listarMomentos(filtros);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Biblioteca de Momentos de Cierre</h1>
        <p className="text-sm text-gray-500">
          Momentos donde se pudo cerrar la venta · {momentos.length} registros
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <a
          href="/admin/momentos"
          className={`rounded border px-3 py-1.5 text-sm ${!params.objecion && !params.resultado ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Todos
        </a>
        <a
          href="/admin/momentos?resultado=cerro"
          className={`rounded border px-3 py-1.5 text-sm ${params.resultado === "cerro" ? "bg-green-600 text-white" : "hover:bg-gray-50"}`}
        >
          Se cerró
        </a>
        <a
          href="/admin/momentos?resultado=perdio"
          className={`rounded border px-3 py-1.5 text-sm ${params.resultado === "perdio" ? "bg-red-600 text-white" : "hover:bg-gray-50"}`}
        >
          No se cerró
        </a>
        {OBJECIONES.map((o) => (
          <a
            key={o}
            href={`/admin/momentos?objecion=${o}`}
            className={`rounded border px-3 py-1.5 text-sm ${params.objecion === o ? "bg-orange-500 text-white" : "hover:bg-gray-50"}`}
          >
            {o}
          </a>
        ))}
      </div>

      {/* Tabla */}
      {momentos.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-sm text-gray-400">
          No hay momentos registrados con estos filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3 text-left">Lead</th>
                <th className="p-3 text-left">Descripción</th>
                <th className="p-3 text-center">Objeción</th>
                <th className="p-3 text-center">Resultado</th>
                <th className="p-3 text-center">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {momentos.map((m) => {
                const lead = m.leads as { nombre?: string; telefono?: string } | null;
                return (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">
                      {lead?.nombre ?? lead?.telefono ?? "—"}
                    </td>
                    <td className="p-3 max-w-md text-gray-700">{m.descripcion}</td>
                    <td className="p-3 text-center">
                      {m.objecion_tipo ? (
                        <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                          {m.objecion_tipo}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.se_cerro ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {m.se_cerro ? "Cerró" : "No cerró"}
                      </span>
                    </td>
                    <td className="p-3 text-center text-gray-500 text-xs">
                      {new Date(m.created_at).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
