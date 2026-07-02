"use client";

import { useState, useCallback } from "react";

interface GhlContactoCardProps {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
}

function CampoCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard no disponible en contextos inseguros */
    }
  }, [valor]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{etiqueta}:</span>
      <span className="text-sm font-medium select-all">{valor}</span>
      <button
        onClick={copiar}
        title={`Copiar ${etiqueta.toLowerCase()}`}
        className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors leading-none"
      >
        {copiado ? "✓" : "⎘"}
      </button>
    </div>
  );
}

export function GhlContactoCard({ nombre, telefono, email }: GhlContactoCardProps) {
  const [todoCopiado, setTodoCopiado] = useState(false);

  const copiarTodo = useCallback(async () => {
    const lineas: string[] = [];
    if (nombre) lineas.push(nombre);
    if (telefono) lineas.push(telefono);
    if (email) lineas.push(email);
    if (!lineas.length) return;
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      setTodoCopiado(true);
      setTimeout(() => setTodoCopiado(false), 1800);
    } catch {
      /* clipboard no disponible */
    }
  }, [nombre, telefono, email]);

  if (!nombre && !telefono && !email) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {nombre && <CampoCopiable etiqueta="Nombre" valor={nombre} />}
      {telefono && <CampoCopiable etiqueta="Tel" valor={telefono} />}
      {email && <CampoCopiable etiqueta="Email" valor={email} />}
      <button
        onClick={copiarTodo}
        title="Copiar nombre, teléfono y email juntos"
        className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted transition-colors font-medium"
      >
        {todoCopiado ? "✓ Copiado" : "Copiar todo"}
      </button>
    </div>
  );
}
