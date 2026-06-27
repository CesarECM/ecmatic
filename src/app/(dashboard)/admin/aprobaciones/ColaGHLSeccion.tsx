"use client";

import { useState } from "react";
import type { ItemAprobacionGHL } from "@/services/ghl-aprobacion";

function tiempoDesde(fecha: string): string {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d`;
}

function ScoreChip({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 80 ? "bg-green-100 text-green-700" :
    pct >= 60 ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700";
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>
      IA {pct}%
    </span>
  );
}

type Filtro = "todos" | "alto" | "medio" | "bajo";

function aplicarFiltro(items: ItemAprobacionGHL[], filtro: Filtro): ItemAprobacionGHL[] {
  if (filtro === "alto")  return items.filter((i) => (i.score_ia ?? 0) >= 0.8);
  if (filtro === "medio") return items.filter((i) => { const s = i.score_ia ?? 0; return s >= 0.6 && s < 0.8; });
  if (filtro === "bajo")  return items.filter((i) => (i.score_ia ?? 0) < 0.6);
  return items;
}

function ItemGHL({ item }: { item: ItemAprobacionGHL }) {
  const fichaHref = item.lead_ecmatic_id
    ? `/admin/leads/${item.lead_ecmatic_id}`
    : `/admin/aprobaciones`;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {item.nombre ?? item.ghl_contact_id.slice(-8)}
            </span>
            {item.score_ia !== null && <ScoreChip score={item.score_ia} />}
            <span className="text-xs text-muted-foreground">
              hace {tiempoDesde(item.created_at)}
            </span>
            {item.conteo_notificaciones > 0 && (
              <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">
                {item.conteo_notificaciones} recordatorio{item.conteo_notificaciones > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            Lead: "{item.mensaje_lead.slice(0, 120)}{item.mensaje_lead.length > 120 ? "…" : ""}"
          </p>
        </div>
        <a
          href={fichaHref}
          className="shrink-0 rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 whitespace-nowrap"
        >
          Revisar →
        </a>
      </div>
    </div>
  );
}

export function ColaGHLSeccion({ items }: { items: ItemAprobacionGHL[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  if (items.length === 0) return null;

  const filtrados = aplicarFiltro(items, filtro);

  const FILTROS: { key: Filtro; label: string }[] = [
    { key: "todos", label: `Todos (${items.length})` },
    { key: "alto",  label: `Score alto (${aplicarFiltro(items, "alto").length})` },
    { key: "medio", label: `Score medio (${aplicarFiltro(items, "medio").length})` },
    { key: "bajo",  label: `Score bajo (${aplicarFiltro(items, "bajo").length})` },
  ];

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-violet-500" />
        Respuestas GHL pendientes ({items.length})
      </p>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              filtro === f.key
                ? "bg-violet-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin resultados para este filtro.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map((item) => <ItemGHL key={item.id} item={item} />)}
        </div>
      )}
    </section>
  );
}
