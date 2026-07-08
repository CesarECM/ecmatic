"use client";

import { useTransition, useState } from "react";
import { agregarAOportunidadesAction } from "@/app/(dashboard)/admin/oportunidades/actions";

interface Props {
  leadId: string;
  /** "icono" = solo ★ para listas; "completo" = texto + icono para ficha */
  variante?: "icono" | "completo";
  className?: string;
}

export function AgregarAPanelBtn({ leadId, variante = "completo", className }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg]    = useState<{ texto: string; ok: boolean } | null>(null);

  function handleClick() {
    setMsg(null);
    start(async () => {
      const res = await agregarAOportunidadesAction(leadId);
      setMsg({ texto: res.mensaje, ok: res.ok });
      if (res.ok) setTimeout(() => setMsg(null), 3000);
    });
  }

  if (variante === "icono") {
    return (
      <div className="relative inline-flex flex-col items-center">
        <button
          onClick={handleClick}
          disabled={pending}
          title={msg?.texto ?? "Agregar al seguimiento de oportunidades"}
          className={`rounded p-1 text-sm transition-colors cursor-pointer
            ${msg?.ok ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500 hover:bg-muted/60"}
            ${pending ? "opacity-50 cursor-not-allowed" : ""}
            ${className ?? ""}`}
        >
          {pending ? "…" : "★"}
        </button>
        {msg && !msg.ok && (
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-red-500 bg-background border rounded px-1 z-10">
            {msg.texto}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer
          ${msg?.ok
            ? "border-yellow-400 bg-yellow-50 text-yellow-700"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}
          ${pending ? "opacity-50 cursor-not-allowed" : ""}
          ${className ?? ""}`}
      >
        <span>★</span>
        {pending ? "Agregando…" : msg?.ok ? "En seguimiento de oportunidades" : "Seguir oportunidad"}
      </button>
      {msg && !msg.ok && (
        <span className="text-xs text-red-500">{msg.texto}</span>
      )}
    </div>
  );
}
