"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { regenerarTodosEmbeddingsAction } from "./actions";

export function RegenerarTodosBtn({ total }: { total: number }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const tid = toast.loading(`Regenerando embeddings de ${total} servicios…`);
    startTransition(async () => {
      try {
        const n = await regenerarTodosEmbeddingsAction();
        toast.success(`${n} embeddings actualizados`, { id: tid });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded border px-2.5 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {pending ? "Regenerando…" : "↺ Regenerar todos los embeddings"}
    </button>
  );
}
