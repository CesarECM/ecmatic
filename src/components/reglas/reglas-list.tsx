"use client";

import { useState } from "react";
import { ReglaCard, type ReglaRow } from "./regla-card";
import { Input } from "@/components/ui/input";

const TIPOS_FILTRO = [
  { value: "todos",       label: "Todos" },
  { value: "tactica",     label: "Tácticas" },
  { value: "urgencia",    label: "Urgencias" },
  { value: "restriccion", label: "Restricciones" },
  { value: "producto",    label: "Producto" },
  { value: "rebate",      label: "Rebates" },
];

export function ReglasList({ reglas }: { reglas: ReglaRow[] }) {
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda]     = useState("");

  const filtradas = reglas.filter(r => {
    if (filtroTipo !== "todos" && r.tipo !== filtroTipo) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return r.nombre.toLowerCase().includes(q) || r.instruccion.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Buscar..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {TIPOS_FILTRO.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {reglas.length === 0
            ? "No hay reglas aún. Crea la primera regla con el botón de arriba."
            : "No hay reglas que coincidan con los filtros."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtradas.map(r => <ReglaCard key={r.id} regla={r} />)}
        </div>
      )}
    </div>
  );
}
