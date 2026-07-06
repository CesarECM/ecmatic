"use client";

import { useTransition, useState, useEffect } from "react";
import { toggleModoIAAction } from "./actions";

interface Props {
  iaConectada: boolean;
}

export function IAToggle({ iaConectada }: Props) {
  const [conectada, setConectada] = useState(iaConectada);
  const [pending, startTransition] = useTransition();

  // Sincronizar cuando el servidor re-renderiza con el valor confirmado
  useEffect(() => { setConectada(iaConectada); }, [iaConectada]);

  function handleToggle() {
    if (conectada) {
      const ok = confirm(
        "¿Desconectar la IA?\n\n" +
        "Los mensajes entrantes seguirán recibiéndose pero ninguna respuesta se enviará automáticamente — todo irá a la cola de aprobación hasta que la reconectes.\n\n" +
        "¿Continuar?"
      );
      if (!ok) return;
    }
    const next = !conectada;
    setConectada(next); // actualización optimista inmediata
    startTransition(() => void toggleModoIAAction(!conectada));
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={conectada
        ? "Pausar respuestas automáticas de IA — los mensajes irán a cola de aprobación"
        : "Reanudar respuestas automáticas de IA (modo seguro_automatico)"}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-all
        ${conectada
          ? "border-orange-400/50 text-orange-700 dark:text-orange-400 hover:bg-orange-500/10"
          : "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"}
        ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {pending ? "Guardando…" : conectada ? "Desconectar IA" : "● Conectar IA"}
    </button>
  );
}
