"use client";

import { useState, useCallback } from "react";

interface GhlContactoCardProps {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  ghlUrl?: string | null;
  waUrl?: string | null;
}

function CampoCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* clipboard no disponible en contextos inseguros */ }
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

export function GhlContactoCard({ nombre, telefono, email, ghlUrl, waUrl }: GhlContactoCardProps) {
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
    } catch { /* clipboard no disponible */ }
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
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir chat en WhatsApp Web"
          className="text-xs px-2.5 py-1 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium"
        >
          WA ↗
        </a>
      )}
      {ghlUrl && (
        <a
          href={ghlUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver contacto en GHL"
          className="text-xs px-2.5 py-1 rounded border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors font-medium"
        >
          GHL ↗
        </a>
      )}
    </div>
  );
}
