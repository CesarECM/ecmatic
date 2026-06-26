"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { generarSugerenciasAction } from "../actions";

export function GenerarSugerenciasBtn() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const id = toast.loading("Generando sugerencias IA...");
    startTransition(async () => {
      const result = await generarSugerenciasAction();
      if (result.error) { toast.error(result.error, { id }); return; }
      const generadas = result.data?.generadas ?? 0;
      if (generadas > 0) {
        toast.success(`${generadas} sugerencia${generadas > 1 ? "s" : ""} generada${generadas > 1 ? "s" : ""} — revísalas en "Pendientes"`, { id });
      } else {
        toast.info("No hay combinaciones vacías que generar", { id });
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
