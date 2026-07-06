"use client";

import { useTransition } from "react";
import { toggleModoIAAction } from "./actions";

interface Props {
  iaConectada: boolean;
}

export function IAToggle({ iaConectada }: Props) {
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    if (iaConectada) {
      const ok = confirm(
        "¿Desconectar la IA?\n\n" +
        "Los mensajes entrantes seguirán recibiéndose pero ninguna respuesta se enviará automáticamente — todo irá a la cola de aprobación hasta que la reconectes.\n\n" +
        "¿Continuar?"
      );
      if (!ok) return;
    }
    startTransition(() => void toggleModoIAAction(!iaConectada));
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={iaConectada
        ? "Pausar respuestas automáticas de IA — los mensajes irán a cola de aprobación"
        : "Reanudar respuestas automáticas de IA (modo seguro_automatico)"}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-all
        ${iaConectada
          ? "border-orange-400/50 text-orange-700 dark:text-orange-400 hover:bg-orange-500/10"
          : "border-green-500/50 text-green-700 dark:text-green-400 hover:bg-green-500/10"}
        ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {pending ? "Guardando…" : iaConectada ? "Desconectar IA" : "Conectar IA"}
    </button>
  );
}
