"use client";
// S26.2 — Botón para obtener transcripto de Meet de una cita finalizada (show)
import { useState } from "react";
import { toast } from "sonner";

interface Props { citaId: string }

export function TranscriptoBtn({ citaId }: Props) {
  const [cargando, setCargando] = useState(false);
  const [obtenido, setObtenido] = useState(false);

  async function obtener() {
    setCargando(true);
    const toastId = toast.loading("Buscando transcripto de Meet…");
    try {
      const res = await fetch("/api/admin/meet-transcripto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citaId }),
      });
      const data = await res.json() as { transcriptoId?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al obtener transcripto", { id: toastId });
        return;
      }
      toast.success("Transcripto obtenido y procesado con IA", { id: toastId });
      setObtenido(true);
    } catch {
      toast.error("Error de red al obtener transcripto", { id: toastId });
    } finally {
      setCargando(false);
    }
  }

  if (obtenido) {
    return <span className="text-xs text-green-600 font-medium">✓ Procesado</span>;
  }

  return (
    <button
      onClick={obtener}
      disabled={cargando}
      className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
    >
      {cargando ? "Obteniendo…" : "Transcripto"}
    </button>
  );
}
