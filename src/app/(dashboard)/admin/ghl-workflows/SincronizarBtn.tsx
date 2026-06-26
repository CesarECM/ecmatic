"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sincronizarAction } from "./actions";

export function SincronizarBtn() {
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const t = toast.loading("Sincronizando con GHL...");
      try {
        const r = await sincronizarAction();
        toast.success(
          `Sync completado: ${r.insertados} nuevos · ${r.actualizados} actualizados`,
          { id: t }
        );
      } catch (err) {
        toast.error(`Error: ${String(err)}`, { id: t });
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleSync} disabled={pending}>
      {pending ? "Sincronizando..." : "⟳ Sincronizar GHL"}
    </Button>
  );
}
