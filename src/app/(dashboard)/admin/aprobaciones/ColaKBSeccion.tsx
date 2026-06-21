"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { aprobarKBAction, actualizarKBAction, eliminarKBAction } from "./actions";

type KBItem = {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  origen: string;
  created_at: string;
};

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
}

function prioridad(item: KBItem) {
  return diasDesde(item.created_at) > 7 ? "importante" : "puede_esperar";
}

const PRIORIDAD_COLOR: Record<string, string> = {
  importante:    "bg-orange-500 text-white",
  puede_esperar: "bg-gray-300 text-gray-700",
};

function ItemKB({ item }: { item: KBItem }) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(item.titulo);
  const [contenido, setContenido] = useState(item.contenido);
  const [pending, startTransition] = useTransition();

  function guardar() {
    const id = toast.loading("Guardando...");
    startTransition(async () => {
      try {
        await actualizarKBAction(item.id, titulo, contenido);
        toast.success("Recurso guardado", { id });
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
        await actualizarKBAction(item.id, titulo, contenido);
        await aprobarKBAction(item.id);
        toast.success("Recurso guardado y aprobado", { id });
        setEditando(false);
      } catch {
        toast.error("Error al guardar y aprobar", { id });
      }
    });
  }

  function cancelar() {
    setTitulo(item.titulo);
    setContenido(item.contenido);
    setEditando(false);
  }

  function aprobar() {
    const id = toast.loading("Aprobando...");
    startTransition(async () => {
      try {
        await aprobarKBAction(item.id);
        toast.success("Recurso aprobado", { id });
      } catch {
        toast.error("Error al aprobar", { id });
      }
    });
  }

  function rechazar() {
    if (!confirm("¿Rechazar y eliminar este recurso de la cola?")) return;
    const id = toast.loading("Rechazando...");
    startTransition(async () => {
      try {
        await eliminarKBAction(item.id);
        toast.success("Recurso rechazado", { id });
      } catch {
        toast.error("Error al rechazar", { id });
      }
    });
  }

  const p = prioridad(item);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      {editando ? (
        <div className="space-y-2">
          <input
            className="w-full rounded border px-2 py-1 text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <textarea
            className="w-full rounded border px-2 py-1 text-sm min-h-[80px] resize-y"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
          />
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={guardarYAprobar}
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
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
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs rounded border px-1.5 py-0.5 bg-blue-100 text-blue-700 border-blue-200">{item.tipo}</span>
              <span className={`text-xs rounded px-1.5 py-0.5 ${PRIORIDAD_COLOR[p]}`}>{p.replace("_", " ")}</span>
              <span className="text-xs text-muted-foreground">hace {diasDesde(item.created_at)}d</span>
            </div>
            <p className="font-medium text-sm mt-1">{titulo}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{contenido}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={aprobar} disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
              Aprobar
            </button>
            <button onClick={() => setEditando(true)} className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200">
              Editar
            </button>
            <button onClick={rechazar} disabled={pending} className="rounded bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50">
              Rechazar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ColaKBSeccion({ items }: { items: KBItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-blue-500" />
        Base de conocimiento ({items.length})
      </p>
      {items.map((item) => <ItemKB key={item.id} item={item} />)}
    </section>
  );
}
