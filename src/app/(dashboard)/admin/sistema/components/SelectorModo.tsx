"use client";

import { useState } from "react";
import type { ModoOperacion } from "@/services/sistema";

const MODOS: { value: ModoOperacion; label: string; descripcion: string; color: string }[] = [
  {
    value: "pruebas",
    label: "Pruebas",
    descripcion: "Solo el Widget de Sandbox responde. Nada llega a leads reales.",
    color: "border-gray-400 text-gray-700",
  },
  {
    value: "seguro",
    label: "Seguro",
    descripcion: "Toda respuesta IA queda en cola de aprobación manual antes de enviarse.",
    color: "border-blue-400 text-blue-700",
  },
  {
    value: "seguro_automatico",
    label: "Seguro Automático",
    descripcion: "Respuestas con score alto se envían solas; las de score bajo esperan revisión.",
    color: "border-amber-400 text-amber-700",
  },
  {
    value: "automatico",
    label: "Automático",
    descripcion: "La IA opera completamente sin intervención humana. Requiere confirmación.",
    color: "border-green-500 text-green-700",
  },
];

interface Props {
  modoActual: ModoOperacion;
  umbralActual: number;
  onCambiarModo: (modo: ModoOperacion) => Promise<void>;
  onCambiarUmbral: (umbral: number) => Promise<void>;
}

export function SelectorModo({ modoActual, umbralActual, onCambiarModo, onCambiarUmbral }: Props) {
  const [confirmando, setConfirmando] = useState<ModoOperacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [umbral, setUmbral] = useState(umbralActual);

  async function handleSeleccionar(modo: ModoOperacion) {
    if (modo === modoActual) return;
    if (modo === "automatico") {
      setConfirmando(modo);
      return;
    }
    await ejecutarCambio(modo);
  }

  async function ejecutarCambio(modo: ModoOperacion) {
    setGuardando(true);
    try {
      await onCambiarModo(modo);
    } finally {
      setGuardando(false);
      setConfirmando(null);
    }
  }

  async function handleGuardarUmbral() {
    setGuardando(true);
    try {
      await onCambiarUmbral(umbral);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {MODOS.map((m) => (
          <button
            key={m.value}
            onClick={() => handleSeleccionar(m.value)}
            disabled={guardando}
            className={`rounded-lg border-2 p-3 text-left transition-all ${
              modoActual === m.value
                ? `${m.color} bg-opacity-10 font-semibold`
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <p className="text-sm font-medium">{m.label}</p>
            <p className="text-xs mt-0.5 opacity-75">{m.descripcion}</p>
          </button>
        ))}
      </div>

      {/* Confirmación para modo Automático */}
      {confirmando === "automatico" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <p className="text-sm font-medium text-red-700">
            ¿Confirmas activar el modo Automático?
          </p>
          <p className="text-xs text-red-600">
            La IA responderá a todos los leads sin revisión humana. Asegúrate de que la base de conocimiento esté validada.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => ejecutarCambio("automatico")}
              disabled={guardando}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
            >
              Sí, activar
            </button>
            <button
              onClick={() => setConfirmando(null)}
              className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Umbral de confianza (aplica en modo seguro_automatico) */}
      {(modoActual === "seguro_automatico" || confirmando === null) && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <label className="text-sm text-muted-foreground shrink-0">
            Umbral de confianza
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={umbral}
            onChange={(e) => setUmbral(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium w-10 text-right">{(umbral * 100).toFixed(0)}%</span>
          <button
            onClick={handleGuardarUmbral}
            disabled={guardando || umbral === umbralActual}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-white disabled:opacity-40 hover:bg-gray-700"
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}
