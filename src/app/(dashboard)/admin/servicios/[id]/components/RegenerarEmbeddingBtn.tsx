"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { regenerarEmbeddingAction } from "../../actions";

export function RegenerarEmbeddingBtn({ servicioId }: { servicioId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const tid = toast.loading("Regenerando embedding…");
    startTransition(async () => {
      try {
        await regenerarEmbeddingAction(servicioId);
        toast.success("Embedding actualizado — el servicio ya es buscable por IA", { id: tid });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al regenerar", { id: tid });
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded border px-2 py-0.5 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 disabled:opacity-50 transition-colors"
    >
      {pending ? "Regenerando…" : "↺ Regenerar embedding"}
    </button>
  );
}
