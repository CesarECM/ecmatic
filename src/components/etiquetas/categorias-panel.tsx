"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  aprobarEtiquetaAction,
  archivarEtiquetaAction,
  crearEtiquetaAction,
  fusionarEtiquetasAction,
} from "@/app/(dashboard)/admin/etiquetas/actions";
import type { CategoriaConEtiquetas } from "@/services/etiquetas";

const ESTADO_BADGE: Record<string, string> = {
  activa:              "bg-green-100 text-green-800",
  pendiente_revision:  "bg-yellow-100 text-yellow-800",
  archivada:           "bg-gray-100 text-gray-500",
};

const ORIGEN_LABEL: Record<string, string> = {
  manual:       "Manual",
  ia_sugerido:  "IA",
  automatico:   "Auto",
};

function EtiquetaRow({
  etiqueta,
  todasLasEtiquetas,
}: {
  etiqueta: CategoriaConEtiquetas["etiquetas"][number];
  todasLasEtiquetas: { id: string; nombre: string }[];
}) {
  const [fusionando, setFusionando] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-sm truncate">{etiqueta.nombre}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[etiqueta.estado]}`}>
          {etiqueta.estado === "pendiente_revision" ? "Pendiente" : etiqueta.estado}
        </span>
        <span className="text-xs text-muted-foreground">{ORIGEN_LABEL[etiqueta.origen]}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {etiqueta.estado === "pendiente_revision" && (
          <form action={aprobarEtiquetaAction.bind(null, etiqueta.id)}>
            <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-700">✓</Button>
          </form>
        )}
        {etiqueta.estado !== "archivada" && (
          <form action={archivarEtiquetaAction.bind(null, etiqueta.id)}>
            <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-600">✕</Button>
          </form>
        )}
        {etiqueta.estado === "activa" && !fusionando && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setFusionando(true)}>
            Fusionar
          </Button>
        )}
        {fusionando && (
          <form action={fusionarEtiquetasAction} onSubmit={() => setFusionando(false)} className="flex gap-1">
            <input type="hidden" name="idOrigen" value={etiqueta.id} />
            <select name="idDestino" className="text-xs border rounded px-1 h-6">
              {todasLasEtiquetas
                .filter((e) => e.id !== etiqueta.id)
                .map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <Button type="submit" size="sm" variant="ghost" className="h-6 px-2 text-xs text-blue-600">OK</Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setFusionando(false)}>✕</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function CategoriasPanel({ categorias }: { categorias: CategoriaConEtiquetas[] }) {
  const [nuevaEtiquetaCatId, setNuevaEtiquetaCatId] = useState<string | null>(null);

  const todasActivas = categorias.flatMap((c) =>
    c.etiquetas.filter((e) => e.estado === "activa").map((e) => ({ id: e.id, nombre: `${c.nombre} / ${e.nombre}` }))
  );

  return (
    <div className="space-y-4">
      {categorias.map((cat) => (
        <div key={cat.id} className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="font-medium text-sm">{cat.nombre}</span>
              <Badge variant="secondary" className="text-xs">{cat.etiquetas.filter(e => e.estado !== "archivada").length}</Badge>
            </div>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
              onClick={() => setNuevaEtiquetaCatId(cat.id === nuevaEtiquetaCatId ? null : cat.id)}>
              + Nueva
            </Button>
          </div>

          {cat.etiquetas.filter((e) => e.estado !== "archivada").map((e) => (
            <EtiquetaRow key={e.id} etiqueta={e} todasLasEtiquetas={todasActivas} />
          ))}

          {nuevaEtiquetaCatId === cat.id && (
            <form action={crearEtiquetaAction} onSubmit={() => setNuevaEtiquetaCatId(null)}
              className="flex gap-2 mt-2">
              <input type="hidden" name="categoriaId" value={cat.id} />
              <Input name="nombre" placeholder="Nombre de la etiqueta" className="h-7 text-xs flex-1" autoFocus required />
              <Button type="submit" size="sm" className="h-7 text-xs">Crear</Button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
