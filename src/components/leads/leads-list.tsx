"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moverLeadAction } from "@/app/(dashboard)/admin/leads/actions";
import { AgregarAPanelBtn } from "@/components/oportunidades/AgregarAPanelBtn";
import type { LeadRow } from "@/services/pipeline";

type Etapa = { id: string; nombre: string; orden: number };

interface LeadsListProps {
  leads: LeadRow[];
  etapasTripwire: Etapa[];
  etapasPremium: Etapa[];
}

const DISC_COLORS: Record<string, string> = {
  D: "bg-red-100 text-red-800",
  I: "bg-yellow-100 text-yellow-800",
  S: "bg-green-100 text-green-800",
  C: "bg-blue-100 text-blue-800",
};

function ScoreSalud({ score }: { score: number }) {
  const color = score >= 67 ? "text-green-600" : score >= 34 ? "text-yellow-600" : "text-red-600";
  return <span className={`text-sm font-semibold ${color}`}>{score}</span>;
}

function soloDigitos(s: string) {
  return s.replace(/\D/g, "");
}

function matchLead(lead: LeadRow, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase().trim();
  const qd = soloDigitos(q);

  if (lead.nombre?.toLowerCase().includes(ql)) return true;
  if (lead.email?.toLowerCase().includes(ql)) return true;
  if (lead.ghl_contact_id?.toLowerCase().includes(ql)) return true;
  if (qd && lead.telefono && soloDigitos(lead.telefono).includes(qd)) return true;
  return false;
}

function highlight(text: string, q: string) {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function LeadsList({ leads, etapasTripwire, etapasPremium }: LeadsListProps) {
  const router = useRouter();
  const [filtroRuta, setFiltroRuta] = useState<"todos" | "tripwire" | "premium">("todos");
  const [filtroEtapa, setFiltroEtapa] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [indiceFocused, setIndiceFocused] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const etapasActuales = filtroRuta === "premium" ? etapasPremium : etapasTripwire;

  // Sugerencias del dropdown — buscan en todos los leads, ignorando filtros de ruta/etapa
  const sugerencias = busqueda.trim().length > 0
    ? leads.filter((l) => matchLead(l, busqueda)).slice(0, 8)
    : [];

  // Lista principal — aplica búsqueda + filtros de ruta/etapa
  const filtrados = leads.filter((l) => {
    if (!matchLead(l, busqueda)) return false;
    if (filtroRuta !== "todos" && l.pipeline_ruta !== filtroRuta) return false;
    if (filtroEtapa !== "todas" && l.pipeline_stage !== filtroEtapa) return false;
    return true;
  });

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navegarALead(id: string) {
    setDropdownAbierto(false);
    router.push(`/admin/leads/${id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownAbierto || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceFocused((i) => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceFocused((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && indiceFocused >= 0) {
      e.preventDefault();
      navegarALead(sugerencias[indiceFocused].id);
    } else if (e.key === "Escape") {
      setDropdownAbierto(false);
    }
  }

  function etapasDeRuta(ruta: string) {
    return ruta === "premium" ? etapasPremium : etapasTripwire;
  }

  function etapaAnterior(lead: LeadRow) {
    const etapas = etapasDeRuta(lead.pipeline_ruta);
    const idx = etapas.findIndex((e) => e.nombre === lead.pipeline_stage);
    return idx > 0 ? etapas[idx - 1].nombre : null;
  }

  function etapaSiguiente(lead: LeadRow) {
    const etapas = etapasDeRuta(lead.pipeline_ruta);
    const idx = etapas.findIndex((e) => e.nombre === lead.pipeline_stage);
    return idx >= 0 && idx < etapas.length - 1 ? etapas[idx + 1].nombre : null;
  }

  return (
    <div className="space-y-3">
      {/* Buscador */}
      <div className="relative">
        <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background focus-within:ring-1 focus-within:ring-ring">
          <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setDropdownAbierto(true);
              setIndiceFocused(-1);
            }}
            onFocus={() => { if (busqueda.trim()) setDropdownAbierto(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por nombre, email, teléfono o código GHL…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {busqueda && (
            <button
              onClick={() => { setBusqueda(""); setDropdownAbierto(false); inputRef.current?.focus(); }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Dropdown autocomplete */}
        {dropdownAbierto && busqueda.trim().length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg overflow-hidden"
          >
            {sugerencias.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados para &ldquo;{busqueda}&rdquo;</p>
            ) : (
              sugerencias.map((lead, i) => {
                const nombre = lead.nombre ?? lead.telefono ?? "Sin nombre";
                const subtitulo = [lead.telefono, lead.email].filter(Boolean).join(" · ");
                return (
                  <button
                    key={lead.id}
                    onMouseDown={(e) => { e.preventDefault(); navegarALead(lead.id); }}
                    onMouseEnter={() => setIndiceFocused(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex flex-col gap-0.5 border-b last:border-b-0 transition-colors ${
                      i === indiceFocused ? "bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{highlight(nombre, busqueda)}</span>
                    {subtitulo && (
                      <span className="text-xs text-muted-foreground">
                        {lead.telefono && highlight(lead.telefono, busqueda)}
                        {lead.telefono && lead.email && " · "}
                        {lead.email && highlight(lead.email, busqueda)}
                      </span>
                    )}
                    {lead.ghl_contact_id && busqueda && lead.ghl_contact_id.toLowerCase().includes(busqueda.toLowerCase()) && (
                      <span className="text-xs text-muted-foreground">
                        GHL: {highlight(lead.ghl_contact_id, busqueda)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["todos", "tripwire", "premium"] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setFiltroRuta(r); setFiltroEtapa("todas"); }}
              className={`px-3 py-1.5 ${filtroRuta === r ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            >
              {r === "todos" ? "Todos" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={filtroEtapa}
          onChange={(e) => setFiltroEtapa(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="todas">Todas las etapas</option>
          {etapasActuales.map((e) => (
            <option key={e.id} value={e.nombre}>{e.nombre}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground self-center">
          {filtrados.length} lead{filtrados.length !== 1 ? "s" : ""}
          {busqueda.trim() && ` · búsqueda: "${busqueda}"`}
        </span>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {busqueda.trim()
              ? `No hay leads que coincidan con "${busqueda}".`
              : "No hay leads con estos filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((lead) => {
            const prev = etapaAnterior(lead);
            const next = etapaSiguiente(lead);
            const nombre = lead.nombre ?? lead.telefono ?? "Sin nombre";

            return (
              <Card key={lead.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Identidad */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`/admin/leads/${lead.id}`}
                          className="font-medium text-sm hover:text-primary truncate"
                        >
                          {nombre}
                        </a>
                        {lead.compra_previa && (
                          <span className="text-xs text-green-600 font-medium">★ Recurrente</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.telefono ?? lead.email ?? "—"}</p>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{lead.pipeline_stage}</Badge>
                      <Badge variant="secondary" className="text-xs">{lead.pipeline_ruta}</Badge>
                      {lead.temperamento_inferido && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DISC_COLORS[lead.temperamento_inferido] ?? ""}`}>
                          {lead.temperamento_inferido}
                        </span>
                      )}
                      <ScoreSalud score={lead.score_salud} />
                    </div>

                    {/* Acciones de etapa + panel */}
                    <div className="flex items-center gap-1">
                      <AgregarAPanelBtn leadId={lead.id} variante="icono" />
                      {prev && (
                        <form action={moverLeadAction}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="nuevaEtapa" value={prev} />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">←</Button>
                        </form>
                      )}
                      {next && (
                        <form action={moverLeadAction}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="nuevaEtapa" value={next} />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">→</Button>
                        </form>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
