"use client";

import { useState, useTransition } from "react";
import { toggleGatilloAction, actualizarGatilloAction } from "../actions";
import type { Gatillo } from "@/services/gatillos";
import type { AudienciaGatillo } from "@/lib/supabase/types";

const TIPO_EMOJI: Record<string, string> = {
  escasez_cupo: "🪑",
  escasez_evaluadores: "👤",
  urgencia_fecha: "📅",
  precio_vigente: "💰",
  evento_proximo: "📣",
  otro: "⚡",
};

export function GatilloCard({ gatillo }: { gatillo: Gatillo }) {
  const [pending, startTransition] = useTransition();
  const [valor, setValor] = useState(gatillo.valor_actual);
  const [fecha, setFecha] = useState(
    gatillo.fecha_expiracion ? gatillo.fecha_expiracion.slice(0, 16) : ""
  );
  const [audiencia, setAudiencia] = useState<AudienciaGatillo>(gatillo.audiencia_objetivo);
  const [editando, setEditando] = useState(false);

  function guardar() {
    startTransition(async () => {
      await actualizarGatilloAction(gatillo.id, {
        valor_actual: valor,
        fecha_expiracion: fecha ? new Date(fecha).toISOString() : null,
        audiencia_objetivo: audiencia,
      });
      setEditando(false);
    });
  }

  const venceProximo =
    gatillo.fecha_expiracion &&
    new Date(gatillo.fecha_expiracion).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  return (
    <div className={`rounded-lg border bg-card p-4 space-y-3 ${gatillo.activo ? "border-green-300" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{TIPO_EMOJI[gatillo.tipo] ?? "⚡"}</span>
          <span className="font-medium text-sm">{gatillo.nombre}</span>
          {venceProximo && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Vence pronto</span>
          )}
        </div>
        <button
          disabled={pending}
          onClick={() => startTransition(() => toggleGatilloAction(gatillo.id, !gatillo.activo))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            gatillo.activo ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            gatillo.activo ? "translate-x-6" : "translate-x-1"
          }`} />
        </button>
      </div>

      {editando ? (
        <div className="space-y-2">
          <input
            className="w-full rounded border px-2 py-1 text-sm"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Valor del gatillo (ej. Quedan 3 cupos)"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              className="flex-1 rounded border px-2 py-1 text-sm"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <select
              className="rounded border px-2 py-1 text-sm"
              value={audiencia}
              onChange={(e) => setAudiencia(e.target.value as AudienciaGatillo)}
            >
              <option value="all">Todos</option>
              <option value="tripwire">Tripwire</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={guardar} disabled={pending}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
              Guardar
            </button>
            <button onClick={() => setEditando(false)}
              className="rounded border px-3 py-1 text-xs hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-gray-700">"{valor || "—"}"</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Audiencia: {audiencia === "all" ? "Todos" : audiencia}</span>
            {gatillo.fecha_expiracion && (
              <span>Expira: {new Date(gatillo.fecha_expiracion).toLocaleDateString("es-MX")}</span>
            )}
          </div>
          <button onClick={() => setEditando(true)}
            className="text-xs text-blue-600 hover:underline">
            Editar
          </button>
        </div>
      )}
    </div>
  );
}
