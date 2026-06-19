"use client";

import { useState, useTransition } from "react";
import { aprobarCeldaAction } from "../actions";
import type { CeldaMatriz } from "@/services/matriz";

function scoreColor(score: number): string {
  if (score >= 0.7) return "bg-green-100 text-green-800";
  if (score >= 0.4) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function DimsBadges({ dims }: { dims: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(dims).map(([k, v]) => (
        <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {k}: {v}
        </span>
      ))}
    </div>
  );
}

function CeldaFila({ celda }: { celda: CeldaMatriz }) {
  const [expandida, setExpandida] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="p-3">
        <DimsBadges dims={celda.dimensiones as Record<string, string>} />
      </td>
      <td className="p-3 text-sm max-w-xs">
        <button
          className="text-left text-gray-700 hover:text-gray-900"
          onClick={() => setExpandida((v) => !v)}
        >
          {expandida ? celda.respuesta_sugerida : `${celda.respuesta_sugerida.slice(0, 80)}…`}
        </button>
      </td>
      <td className="p-3 text-center">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${scoreColor(celda.score_efectividad)}`}>
          {Math.round(celda.score_efectividad * 100)}%
        </span>
      </td>
      <td className="p-3 text-center text-sm text-gray-500">
        {celda.usos} / {celda.cierres}
      </td>
      <td className="p-3 text-center">
        <span className={`rounded px-2 py-0.5 text-xs ${celda.aprobado ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {celda.aprobado ? "Aprobada" : "Pendiente"}
        </span>
      </td>
      <td className="p-3 text-center">
        {!celda.aprobado && (
          <button
            disabled={pending}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
            onClick={() => startTransition(() => aprobarCeldaAction(celda.id))}
          >
            Aprobar
          </button>
        )}
      </td>
    </tr>
  );
}

export function MatrizExplorer({ celdas }: { celdas: CeldaMatriz[] }) {
  if (celdas.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-gray-400">
        No hay celdas con los filtros actuales. Genera sugerencias con el botón de arriba.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="p-3 text-left">Dimensiones</th>
            <th className="p-3 text-left">Respuesta sugerida</th>
            <th className="p-3 text-center">Score</th>
            <th className="p-3 text-center">Usos / Cierres</th>
            <th className="p-3 text-center">Estado</th>
            <th className="p-3 text-center">Acción</th>
          </tr>
        </thead>
        <tbody>
          {celdas.map((c) => (
            <CeldaFila key={c.id} celda={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
