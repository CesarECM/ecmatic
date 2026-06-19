import Link from "next/link";
import { listarCitas } from "@/services/citas";
import type { EstadoCita } from "@/lib/supabase/types";

const ESTADOS: EstadoCita[] = ["pendiente", "confirmada", "show", "noshow", "cancelada"];
const BADGE: Record<EstadoCita, string> = {
  pendiente:  "bg-yellow-100 text-yellow-800",
  confirmada: "bg-blue-100 text-blue-800",
  show:       "bg-green-100 text-green-800",
  noshow:     "bg-red-100 text-red-800",
  cancelada:  "bg-gray-100 text-gray-600",
};

interface Props { searchParams: Promise<{ estado?: EstadoCita }> }

export default async function CitasPage({ searchParams }: Props) {
  const { estado } = await searchParams;
  const citas = await listarCitas({ estado });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Citas agendadas</h1>
        <p className="text-sm text-muted-foreground">{citas.length} resultado(s)</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/citas" className={`rounded border px-3 py-1 text-sm ${!estado ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
          Todas
        </Link>
        {ESTADOS.map((e) => (
          <Link key={e} href={`/admin/citas?estado=${e}`}
            className={`rounded border px-3 py-1 text-sm capitalize ${estado === e ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            {e}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-left">Vendedor</th>
              <th className="p-3 text-left">Fecha</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Meet</th>
            </tr>
          </thead>
          <tbody>
            {citas.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin citas</td></tr>
            )}
            {citas.map((c) => {
              const lead = c.leads as unknown as { nombre: string | null; telefono: string | null } | null;
              const vendedor = c.vendedores as unknown as { nombre: string } | null;
              return (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{lead?.nombre ?? lead?.telefono ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{vendedor?.nombre ?? "Sin asignar"}</td>
                  <td className="p-3">
                    {new Date(c.fecha_inicio).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${BADGE[c.estado as EstadoCita]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {c.google_meet_link
                      ? <a href={c.google_meet_link} target="_blank" className="text-blue-600 text-xs hover:underline">Abrir</a>
                      : <span className="text-xs text-gray-400">—</span>}
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
