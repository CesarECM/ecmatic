import Link from "next/link";
import { construirMatrizCAGC } from "@/services/matriz-cagc-global";
import type { CeldaMatriz } from "@/services/matriz-cagc-global";

export const metadata = { title: "Matriz Global CAGC · ECMatic" };
export const revalidate = 0;

// S29.4 — Colores por estado de celda
function colorCelda(celda: CeldaMatriz): string {
  if (!celda.cubiertaPorPipeline) return "bg-gray-100 text-gray-400"; // hueco visual
  if (celda.leadCount > 0)        return "bg-blue-100 text-blue-900 font-semibold";
  return "bg-green-50 text-green-700"; // cubierta pero sin leads activos
}

// S29.3 — URL de detalle para una celda
function urlDetalle(ruta: string | null, faseNumero: number): string {
  if (!ruta) return "#";
  return `/admin/leads?ruta=${ruta}&fase=${faseNumero}`;
}

export default async function MatrizCAGCGlobalPage() {
  const { fases, servicios } = await construirMatrizCAGC();

  const fasesGrupos = [
    { label: "Descubrimiento", rango: [0, 4],  color: "bg-purple-100 text-purple-800" },
    { label: "Evaluación",     rango: [5, 8],  color: "bg-yellow-100 text-yellow-800" },
    { label: "Decisión",       rango: [9, 10], color: "bg-orange-100 text-orange-800" },
    { label: "Post-venta",     rango: [11, 16], color: "bg-teal-100 text-teal-800" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Matriz Global Servicios × Fases CAGC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cada celda muestra leads activos en esa fase. Clic para ver el detalle.
        </p>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-blue-100 border" />
          Con leads activos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-green-50 border" />
          Cubierta por pipeline, sin leads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-gray-100 border" />
          Sin cobertura de pipeline (hueco)
        </span>
      </div>

      {/* Tabla con scroll horizontal */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-xs w-full border-collapse">
          <thead>
            {/* Fila de grupos */}
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left min-w-[160px]">
                Servicio
              </th>
              {fasesGrupos.map((grupo) => (
                <th
                  key={grupo.label}
                  colSpan={grupo.rango[1] - grupo.rango[0] + 1}
                  className={`px-2 py-1 text-center border-l ${grupo.color}`}
                >
                  {grupo.label}
                </th>
              ))}
            </tr>
            {/* Fila de números de fase */}
            <tr className="border-b bg-muted/20">
              <th className="sticky left-0 z-10 bg-muted/20 px-3 py-2" />
              {fases.map((fase) => (
                <th
                  key={fase.numero}
                  className="px-1 py-1.5 text-center border-l text-muted-foreground font-normal w-10 min-w-[40px]"
                  title={fase.nombre}
                >
                  {fase.numero}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {servicios.map((svc) => (
              <tr key={svc.id} className="border-b hover:bg-muted/10">
                {/* Columna de servicio */}
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium border-r max-w-[160px]">
                  <div className="truncate" title={svc.titulo}>{svc.titulo}</div>
                  {svc.ruta && (
                    <span className="text-[10px] text-muted-foreground">{svc.ruta}</span>
                  )}
                </td>
                {/* Celdas por fase */}
                {svc.celdas.map((celda) => (
                  <td
                    key={celda.faseNumero}
                    className="border-l p-0.5 text-center"
                  >
                    {/* S29.3 — celda clickeable */}
                    <Link
                      href={urlDetalle(svc.ruta, celda.faseNumero)}
                      className={`flex items-center justify-center w-full h-7 rounded text-xs transition-opacity hover:opacity-80 ${colorCelda(celda)}`}
                      title={
                        celda.cubiertaPorPipeline
                          ? `${celda.leadCount} lead(s) · pipelines: ${celda.pipelines.join(", ")}`
                          : "Sin cobertura de pipeline"
                      }
                    >
                      {celda.leadCount > 0 ? celda.leadCount : ""}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {servicios.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">
            No hay servicios en el catálogo. Crea un recurso de tipo &quot;servicio&quot; en la Base de Conocimiento.
          </p>
        )}
      </div>

      {/* Mapa de nombres de fases */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Ver nombres de fases CAGC</summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 pl-2">
          {fases.map((f) => (
            <span key={f.numero}>
              <span className="font-mono">{f.numero}</span> — {f.nombre}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}
