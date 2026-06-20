"use client";

import { useState, useTransition } from "react";
import { aprobarMatrizAction, actualizarMatrizAction, eliminarMatrizAction } from "./actions";

type MatrizItem = {
  id: string;
  dimensiones: Record<string, string>;
  respuesta_sugerida: string;
  origen: string;
  created_at: string;
};

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function ItemMatriz({ item }: { item: MatrizItem }) {
  const [editando, setEditando] = useState(false);
  const [respuesta, setRespuesta] = useState(item.respuesta_sugerida);
  const [pending, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      await actualizarMatrizAction(item.id, respuesta);
      setEditando(false);
    });
  }

  function cancelar() {
    setRespuesta(item.respuesta_sugerida);
    setEditando(false);
  }

  function eliminar() {
    if (!confirm("¿Eliminar esta entrada de la Matriz nD?")) return;
    startTransition(() => eliminarMatrizAction(item.id));
  }

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex gap-1 flex-wrap">
        {Object.entries(item.dimensiones).map(([k, v]) => (
          <span key={k} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{k}: {v}</span>
        ))}
        <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
      </div>
      {editando ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border px-2 py-1 text-sm min-h-[80px] resize-y"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              onClick={guardar}
              disabled={pending}
              className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50"
            >
              Guardar
            </button>
            <button onClick={cancelar} className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground line-clamp-2">{respuesta}</p>
          <div className="flex gap-1 shrink-0">
            <form action={aprobarMatrizAction.bind(null, item.id)}>
              <button type="submit" disabled={pending} className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50">
                Aprobar
              </button>
            </form>
            <button onClick={() => setEditando(true)} className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200">
              Editar
            </button>
            <button onClick={eliminar} disabled={pending} className="rounded bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50">
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ColaMatrizSeccion({ items }: { items: MatrizItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-orange-500" />
        Matriz nD ({items.length})
      </p>
      {items.map((item) => <ItemMatriz key={item.id} item={item} />)}
    </section>
  );
}
