import { cargarMatrizIntegridad } from "@/services/auditoria-integridad";
import type { ResultadoIntegridadLead, EslaboVerificacion } from "@/services/auditoria-integridad";
import Link from "next/link";

export const metadata = { title: "Auditoría de Integridad · ECMatic" };
export const revalidate = 0;

const ESLABONES_ORDEN = ["nombre", "pipeline", "tarea", "cagc", "calendar"];
const ESLABONES_LABEL: Record<string, string> = {
  nombre:   "Nombre",
  pipeline: "Pipeline",
  tarea:    "Tarea",
  cagc:     "CAGC",
  calendar: "Calendar",
};

function Check({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "text-green-600" : "text-red-500"} title={ok ? "OK" : "Falla"}>
      {ok ? "✅" : "❌"}
    </span>
  );
}

function ResumenFila({ r }: { r: ResultadoIntegridadLead }) {
  const eslabonesMap = Object.fromEntries(r.eslabones.map((e) => [e.clave, e]));
  return (
    <tr className={`border-b text-xs ${r.totalFallidos > 0 ? "bg-red-50/40" : ""}`}>
      <td className="px-3 py-2 font-medium max-w-[140px]">
        <Link
          href={`/admin/leads/${r.leadId}`}
          className="hover:underline truncate block"
          title={r.nombre ?? r.telefono ?? r.leadId}
        >
          {r.nombre ?? r.telefono ?? r.leadId.slice(0, 8)}
        </Link>
      </td>
      {ESLABONES_ORDEN.map((clave) => {
        const e: EslaboVerificacion | undefined = eslabonesMap[clave];
        if (!e) {
          return (
            <td key={clave} className="px-2 py-2 text-center text-muted-foreground/40">—</td>
          );
        }
        return (
          <td key={clave} className="px-2 py-2 text-center" title={e.detalle ?? ""}>
            <Check ok={e.ok} />
          </td>
        );
      })}
      <td className="px-2 py-2 text-center">
        {r.totalFallidos > 0 ? (
          <span className="text-red-600 font-semibold">{r.totalFallidos}</span>
        ) : (
          <span className="text-green-600">0</span>
        )}
      </td>
    </tr>
  );
}

function AlertaFila({ r }: { r: ResultadoIntegridadLead }) {
  const fallidos = r.eslabones.filter((e) => !e.ok);
  if (!fallidos.length) return null;
  return (
    <li className="border rounded p-3 bg-card text-sm space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/admin/leads/${r.leadId}`} className="font-medium hover:underline">
          {r.nombre ?? r.telefono ?? r.leadId.slice(0, 8)}
        </Link>
        <span className={`text-xs px-2 py-0.5 rounded ${
          r.totalFallidos >= 3 ? "bg-red-100 text-red-700" :
          r.totalFallidos === 2 ? "bg-orange-100 text-orange-700" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {r.totalFallidos} falla{r.totalFallidos > 1 ? "s" : ""}
        </span>
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        {fallidos.map((e) => (
          <li key={e.clave}>❌ <strong>{e.label}:</strong> {e.detalle}</li>
        ))}
      </ul>
    </li>
  );
}

export default async function AuditoriaIntegridadPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const vista = params.vista === "lista" ? "lista" : "matriz";
  const pagina = parseInt(params.pagina ?? "0", 10);
  const POR_PAGINA = 50;

  const { resultados, total } = await cargarMatrizIntegridad(pagina, POR_PAGINA);
  const conFallas = resultados.filter((r) => r.totalFallidos > 0);
  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Auditoría de Integridad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total} leads activos · {conFallas.length} con fallas en esta página
        </p>
      </div>

      {/* Selector de vista */}
      <div className="flex gap-2 text-sm">
        <Link
          href="?vista=matriz"
          className={`px-3 py-1.5 rounded border ${vista === "matriz" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
        >
          Matriz ✅/❌
        </Link>
        <Link
          href="?vista=lista"
          className={`px-3 py-1.5 rounded border ${vista === "lista" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
        >
          Lista de alertas
        </Link>
      </div>

      {/* S29.7 — Vista de matriz */}
      {vista === "matriz" && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left min-w-[140px]">Lead</th>
                {ESLABONES_ORDEN.map((c) => (
                  <th key={c} className="px-2 py-2 text-center border-l">{ESLABONES_LABEL[c]}</th>
                ))}
                <th className="px-2 py-2 text-center border-l">Fallas</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => <ResumenFila key={r.leadId} r={r} />)}
            </tbody>
          </table>
          {resultados.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">Sin leads activos.</p>
          )}
        </div>
      )}

      {/* S29.8 — Vista de lista */}
      {vista === "lista" && (
        <ul className="space-y-2">
          {conFallas.length === 0 ? (
            <li className="text-sm text-muted-foreground p-4 text-center border rounded bg-card">
              Todos los leads activos en esta página tienen integridad completa. 🎉
            </li>
          ) : (
            conFallas.map((r) => <AlertaFila key={r.leadId} r={r} />)
          )}
        </ul>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex gap-2 text-sm pt-2">
          {pagina > 0 && (
            <Link href={`?vista=${vista}&pagina=${pagina - 1}`} className="px-3 py-1.5 border rounded hover:bg-muted">
              ← Anterior
            </Link>
          )}
          <span className="px-3 py-1.5 text-muted-foreground">
            Página {pagina + 1} / {totalPaginas}
          </span>
          {pagina < totalPaginas - 1 && (
            <Link href={`?vista=${vista}&pagina=${pagina + 1}`} className="px-3 py-1.5 border rounded hover:bg-muted">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
