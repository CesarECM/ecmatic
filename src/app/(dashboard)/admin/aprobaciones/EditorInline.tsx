"use client";

// S61 — Diff visual al editar un recurso KB antes de confirmar.
// wordDiff: LCS O(m*n) — valid para contenido KB (<200 palabras).

import { useState, useMemo } from "react";

type DiffPart = { t: "s" | "d" | "a"; v: string };

function wordDiff(oldText: string, newText: string): DiffPart[] {
  const a = oldText.split(/(\s+)/);
  const b = newText.split(/(\s+)/);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const r: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { r.push({ t: "s", v: a[i] }); i++; j++; }
    else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { r.push({ t: "a", v: b[j] }); j++; }
    else { r.push({ t: "d", v: a[i] }); i++; }
  }
  return r;
}

function DiffPanel({ t0, c0, titulo, contenido }: { t0: string; c0: string; titulo: string; contenido: string }) {
  const parts = useMemo(() => wordDiff(c0, contenido), [c0, contenido]);
  const hayTitulo = titulo !== t0;
  const hayContenido = contenido !== c0;
  if (!hayTitulo && !hayContenido) return null;
  return (
    <div className="rounded border border-blue-200 bg-blue-50/60 p-2 text-xs">
      <p className="font-medium text-blue-700 mb-1">Cambios respecto al original</p>
      {hayTitulo && (
        <p className="mb-1">
          <span className="text-gray-500 mr-1">Título:</span>
          <span className="line-through text-red-600 mr-1">{t0}</span>→
          <span className="text-green-700 font-medium ml-1">{titulo}</span>
        </p>
      )}
      {hayContenido && (
        <div className="leading-relaxed">
          {parts.map((p, idx) =>
            p.t === "d" ? (
              <span key={idx} className="line-through text-red-600 bg-red-50">{p.v}</span>
            ) : p.t === "a" ? (
              <span key={idx} className="text-green-700 bg-green-50 font-medium">{p.v}</span>
            ) : (
              <span key={idx} className="text-gray-600">{p.v}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function EditorInline({ titulo: t0, contenido: c0, onConfirmar, onCancelar, pending }: {
  titulo: string; contenido: string;
  onConfirmar: (t: string, c: string, razon: string) => void;
  onCancelar: () => void;
  pending: boolean;
}) {
  const [titulo, setTitulo] = useState(t0);
  const [contenido, setContenido] = useState(c0);
  const [razon, setRazon] = useState("");
  const valido = titulo.trim() && contenido.trim() && razon.trim();
  return (
    <div className="space-y-2 mt-2 p-3 rounded bg-gray-50 border">
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        placeholder="Título del recurso"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <textarea
        className="w-full rounded border px-2 py-1 text-sm min-h-[90px] resize-y"
        placeholder="Contenido"
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <DiffPanel t0={t0} c0={c0} titulo={titulo} contenido={contenido} />
      <textarea
        className="w-full rounded border px-2 py-1 text-xs min-h-[48px] resize-none bg-yellow-50 border-yellow-300"
        placeholder="¿Por qué editaste esto? (obligatorio)"
        value={razon}
        onChange={(e) => setRazon(e.target.value)}
      />
      <div className="flex gap-1">
        <button
          onClick={() => onConfirmar(titulo, contenido, razon)}
          disabled={pending || !valido}
          className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
        >
          Guardar → Aplicar al KB
        </button>
        <button onClick={onCancelar} className="rounded bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300">
          Cancelar
        </button>
      </div>
    </div>
  );
}
