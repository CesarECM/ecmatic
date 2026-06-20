"use client";

import { useState, useTransition } from "react";
import { aprobarMensajeAction, rechazarMensajeAction, actualizarMensajeAction } from "./actions";

type MensajeItem = {
  id: string;
  telefono: string;
  respuesta: string;
  bloques: string[];
  score_confianza: number | null;
  created_at: string;
  lead_nombre: string | null;
};

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 0.7 ? "bg-green-100 text-green-700" :
    score >= 0.4 ? "bg-amber-100 text-amber-700" :
                   "bg-red-100 text-red-700";
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>
      Score {(score * 100).toFixed(0)}%
    </span>
  );
}

function ItemMensaje({ item }: { item: MensajeItem }) {
  const [editando, setEditando] = useState(false);
  const [respuesta, setRespuesta] = useState(item.respuesta);
  const [pending, startTransition] = useTransition();

  function enviar() {
    startTransition(() => aprobarMensajeAction(item.id, item.telefono, [respuesta]));
  }

  function soloGuardar() {
    startTransition(async () => {
      await actualizarMensajeAction(item.id, respuesta);
      setEditando(false);
    });
  }

  function rechazar() {
    startTransition(() => rechazarMensajeAction(item.id));
  }

  return (
    <div className="rounded-lg border border-teal-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {item.lead_nombre ?? item.telefono} · hace {diasDesde(item.created_at)}d
          </span>
          {item.score_confianza !== null && <ScoreBadge score={item.score_confianza} />}
        </div>
      </div>

      {editando ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border px-2 py-1 text-sm min-h-[100px] resize-y"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
          />
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={enviar}
              disabled={pending}
              className="rounded bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Enviar editado
            </button>
            <button
              onClick={soloGuardar}
              disabled={pending}
              className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              Solo guardar
            </button>
            <button
              onClick={() => { setRespuesta(item.respuesta); setEditando(false); }}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap line-clamp-3">{respuesta}</p>
          <div className="flex gap-1 mt-2 shrink-0">
            <button
              onClick={enviar}
              disabled={pending}
              className="rounded bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Enviar
            </button>
            <button onClick={() => setEditando(true)} className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200">
              Editar
            </button>
            <button onClick={rechazar} disabled={pending} className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300 disabled:opacity-50">
              Rechazar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ColaMensajesSeccion({ items }: { items: MensajeItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-teal-500" />
        Respuestas en cola ({items.length})
      </p>
      {items.map((item) => <ItemMensaje key={item.id} item={item} />)}
    </section>
  );
}
