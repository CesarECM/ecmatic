"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { aprobarCeldaAction, actualizarCeldaAction, rechazarCeldaAction } from "../actions";
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
  const [editando, setEditando]   = useState(false);
  const [respuesta, setRespuesta] = useState(celda.respuesta_sugerida);
  const [pending, startTransition] = useTransition();

  function cancelar() {
    setRespuesta(celda.respuesta_sugerida);
    setEditando(false);
  }

  function guardar() {
    const id = toast.loading("Guardando...");
    startTransition(async () => {
      try {
        await actualizarCeldaAction(celda.id, respuesta);
        toast.success("Respuesta guardada", { id });
        setEditando(false);
      } catch {
        toast.error("Error al guardar", { id });
      }
    });
  }

  function guardarYAprobar() {
    const id = toast.loading("Guardando y aprobando...");
    startTransition(async () => {
      try {
        await actualizarCeldaAction(celda.id, respuesta);
        await aprobarCeldaAction(celda.id);
        toast.success("Celda guardada y aprobada", { id });
        setEditando(false);
      } catch {
        toast.error("Error al guardar y aprobar", { id });
      }
    });
  }

  function aprobar() {
    const id = toast.loading("Aprobando...");
    startTransition(async () => {
      try {
        await aprobarCeldaAction(celda.id);
        toast.success("Celda aprobada", { id });
      } catch {
        toast.error("Error al aprobar", { id });
      }
    });
  }

  function rechazar() {
    if (!confirm("¿Rechazar esta celda de la Matriz nD?")) return;
    const id = toast.loading("Rechazando...");
    startTransition(async () => {
      try {
        await rechazarCeldaAction(celda.id);
        toast.success("Celda rechazada", { id });
      } catch {
        toast.error("Error al rechazar", { id });
      }
    });
  }

  // ── Modo edición: fila expandida ──────────────────────────
  if (editando) {
    return (
      <tr className="border-b bg-orange-50/60">
        <td className="p-3">
          <DimsBadges dims={celda.dimensiones as Record<string, string>} />
        </td>
        <td colSpan={4} className="p-3">
          <textarea
            className="w-full rounded border px-2 py-1.5 text-sm min-h-[80px] resize-y bg-white"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            <button
              onClick={guardarYAprobar}
              disabled={pending}
              className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
            >
              Guardar y Aprobar
            </button>
            <button
              onClick={guardar}
              disabled={pending}
              className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              Solo guardar
            </button>
            <button onClick={cancelar} className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </td>
        <td className="p-3" />
      </tr>
    );
  }

  // ── Modo lectura ──────────────────────────────────────────
  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="p-3">
        <DimsBadges dims={celda.dimensiones as Record<string, string>} />
      </td>
      <td className="p-3 text-sm max-w-xs text-gray-700">
        {celda.respuesta_sugerida.length > 100
          ? `${celda.respuesta_sugerida.slice(0, 100)}…`
          : celda.respuesta_sugerida}
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
        {celda.aprobado ? (
          <button
            onClick={() => setEditando(true)}
            className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
          >
            Editar
          </button>
        ) : (
          <div className="flex gap-1 justify-center flex-wrap">
            <button
              disabled={pending}
              onClick={aprobar}
              className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
            >
              Aprobar
            </button>
            <button
              onClick={() => setEditando(true)}
              className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200"
            >
              Editar
            </button>
            <button
              disabled={pending}
              onClick={rechazar}
              className="rounded bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
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
            <th className="p-3 text-center">Acciones</th>
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
