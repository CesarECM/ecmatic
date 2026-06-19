import { Suspense } from "react";
import { listarMatriz } from "@/services/matriz";
import { MatrizExplorer } from "./components/MatrizExplorer";
import { MatrizFiltros } from "./components/MatrizFiltros";
import { GenerarSugerenciasBtn } from "./components/GenerarSugerenciasBtn";
import type { FiltrosMatriz } from "@/services/matriz";

interface Props {
  searchParams: Promise<{ aprobado?: string; temperamento?: string; objecion?: string; temperatura?: string }>;
}

export default async function MatrizPage({ searchParams }: Props) {
  const params = await searchParams;

  const filtros: FiltrosMatriz = {};
  if (params.aprobado !== undefined) filtros.aprobado = params.aprobado === "true";
  if (params.temperamento) filtros.temperamento = params.temperamento;
  if (params.objecion) filtros.objecion = params.objecion;

  const celdas = await listarMatriz(filtros);
  const pendientes = celdas.filter((c) => !c.aprobado).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Matriz nD de Personalización</h1>
          <p className="text-sm text-gray-500">
            {celdas.length} celdas · {pendientes} pendientes de aprobación
          </p>
        </div>
        <GenerarSugerenciasBtn />
      </div>

      <Suspense>
        <MatrizFiltros />
      </Suspense>

      <MatrizExplorer celdas={celdas} />
    </div>
  );
}
