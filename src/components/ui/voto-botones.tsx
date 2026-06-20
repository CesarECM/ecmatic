"use client";

import { useState } from "react";

interface VotoBotonesProps {
  mensajeId: string;
  votoInicial?: "bueno" | "malo" | null;
}

export function VotoBotones({ mensajeId, votoInicial = null }: VotoBotonesProps) {
  const [voto, setVoto]           = useState<"bueno" | "malo" | null>(votoInicial);
  const [comentario, setComentario] = useState("");
  const [showComentario, setShowComentario] = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [confirmado, setConfirmado] = useState(!!votoInicial);

  async function enviarVoto(tipo: "bueno" | "malo", comentarioTexto?: string) {
    setEnviando(true);
    try {
      await fetch("/api/admin/votos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajeId, voto: tipo, comentario: comentarioTexto ?? null }),
      });
      setVoto(tipo);
      setConfirmado(true);
      setShowComentario(false);
    } catch {
      // silencioso — UI no se rompe
    } finally {
      setEnviando(false);
    }
  }

  function handleVoto(tipo: "bueno" | "malo") {
    if (confirmado && voto === tipo) return; // ya votado
    if (tipo === "malo" && !showComentario && !confirmado) {
      setShowComentario(true); // mostrar campo de comentario antes de confirmar negativo
      setVoto(tipo);
      return;
    }
    enviarVoto(tipo);
  }

  if (confirmado) {
    return (
      <span className={`text-xs ml-2 ${voto === "bueno" ? "text-green-600" : "text-red-500"}`}>
        {voto === "bueno" ? "👍 Buena respuesta" : "👎 Marcada como mala"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 ml-2">
      <button
        onClick={() => handleVoto("bueno")}
        disabled={enviando}
        title="Buena respuesta"
        className="text-xs px-1.5 py-0.5 rounded hover:bg-green-100 text-muted-foreground hover:text-green-700 transition-colors disabled:opacity-40"
      >
        👍
      </button>
      <button
        onClick={() => handleVoto("malo")}
        disabled={enviando}
        title="Respuesta mejorable"
        className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40"
      >
        👎
      </button>
      {showComentario && (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviarVoto("malo", comentario); if (e.key === "Escape") setShowComentario(false); }}
            placeholder="¿Qué falló? (opcional)"
            className="text-xs border rounded px-2 py-0.5 w-40 bg-background"
          />
          <button
            onClick={() => enviarVoto("malo", comentario)}
            disabled={enviando}
            className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40"
          >
            Enviar
          </button>
        </span>
      )}
    </span>
  );
}
