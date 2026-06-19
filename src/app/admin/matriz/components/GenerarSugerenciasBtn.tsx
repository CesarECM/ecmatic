"use client";

import { useTransition } from "react";
import { generarSugerenciasAction } from "../actions";

export function GenerarSugerenciasBtn() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const resultado = await generarSugerenciasAction();
      if (resultado.generadas > 0) {
        alert(`Se generaron ${resultado.generadas} sugerencias nuevas. Revísalas en "Pendientes".`);
      } else {
        alert("No se encontraron combinaciones de dimensiones vacías que generar.");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Generando…" : "Generar sugerencias IA"}
    </button>
  );
}
