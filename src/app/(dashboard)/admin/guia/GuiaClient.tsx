"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ModuloGuia } from "@/lib/guia/features";

const ESTADO_BADGE = {
  activo: { label: "Activo", variant: "default" as const },
  automatico: { label: "Automático", variant: "secondary" as const },
  proximo: { label: "Próximamente", variant: "outline" as const },
};

function FeatureItem({ f }: { f: ModuloGuia["features"][number] }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{f.titulo}</span>
          {f.badge && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
              {f.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{f.descripcion}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={ESTADO_BADGE[f.estado].variant} className="text-[10px]">
          {ESTADO_BADGE[f.estado].label}
        </Badge>
        {f.href && (
          <Link href={f.href}
            className="text-xs text-primary hover:underline">
            Ir →
          </Link>
        )}
      </div>
    </div>
  );
}

function ModuloAccordion({ modulo, query }: { modulo: ModuloGuia; query: string }) {
  const [abierto, setAbierto] = useState(false);
  const featsFiltradas = modulo.features.filter(
    (f) =>
      !query ||
      f.titulo.toLowerCase().includes(query) ||
      f.descripcion.toLowerCase().includes(query)
  );
  if (!featsFiltradas.length) return null;

  const debeAbrir = !!query || abierto;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="text-base">{modulo.emoji}</span>
        <span className="font-medium text-sm flex-1 text-left">{modulo.label}</span>
        <span className="text-xs text-muted-foreground">{featsFiltradas.length} funciones</span>
        <span className="text-muted-foreground text-xs">{debeAbrir ? "▲" : "▼"}</span>
      </button>
      {debeAbrir && (
        <div className="border-t px-4 py-1">
          {featsFiltradas.map((f) => <FeatureItem key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}

interface Props { modulos: ModuloGuia[] }

export function GuiaClient({ modulos }: Props) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();

  const totalFeatures = modulos.reduce((s, m) => s + m.features.length, 0);

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar función…"
        className="w-full text-sm border rounded-md px-3 py-2 bg-background max-w-md"
      />
      <p className="text-xs text-muted-foreground">
        {totalFeatures} funciones documentadas en {modulos.length} módulos
      </p>
      <div className="space-y-2">
        {modulos.map((m) => <ModuloAccordion key={m.id} modulo={m} query={q} />)}
      </div>
    </div>
  );
}
