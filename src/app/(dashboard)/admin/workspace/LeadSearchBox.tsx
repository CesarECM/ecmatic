"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "./WorkspaceContext";
import type { LeadSearchResult } from "@/services/leads-search";

function scoreColor(s: number) {
  if (s >= 67) return "text-green-600";
  if (s >= 34) return "text-yellow-600";
  return "text-red-500";
}

export function LeadSearchBox() {
  const { selectLead } = useWorkspace();

  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef      = useRef<HTMLDivElement>(null);

  const buscar = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(`/api/admin/leads/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(({ results: res }: { results: LeadSearchResult[] }) => {
        setResults(res ?? []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, buscar]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(r: LeadSearchResult) {
    selectLead(r.id, null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <Input
        type="search"
        placeholder="Buscar lead…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        className="h-6 text-xs px-2 border-dashed"
      />

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
          <ul className="max-h-72 overflow-y-auto divide-y divide-border">
            {results.map((r) => {
              const label = r.nombre ?? r.telefono ?? r.email ?? r.id.slice(0, 8);
              return (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 cursor-pointer group">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => handleSelect(r)}
                  >
                    <span className="block text-sm font-medium truncate">{label}</span>
                    <span className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground truncate">{r.pipeline_stage}</span>
                      <span className={`text-[10px] font-semibold ${scoreColor(r.score_salud)}`}>
                        ★{r.score_salud}
                      </span>
                    </span>
                  </button>
                  <a
                    href={`/admin/leads/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity px-1"
                    title="Ver perfil completo"
                  >
                    ↗
                  </a>
                </li>
              );
            })}
          </ul>
          {loading && (
            <p className="text-[10px] text-muted-foreground text-center py-1.5">Buscando…</p>
          )}
        </div>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-lg shadow-lg px-3 py-2">
          <p className="text-xs text-muted-foreground">Sin resultados</p>
        </div>
      )}
    </div>
  );
}
