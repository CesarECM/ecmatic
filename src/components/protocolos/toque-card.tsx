"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { upsertToqueAction, eliminarToqueAction, reordenarToquesAction } from "@/app/(dashboard)/admin/protocolos/actions";
import type { Toque } from "@/services/protocolos-seguimiento";

const CANAL_CONFIG = {
  whatsapp: { label: "WhatsApp",  color: "bg-green-100 text-green-700 border-green-300" },
  llamada:  { label: "Llamada",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  email:    { label: "Email",     color: "bg-orange-100 text-orange-700 border-orange-300" },
};

interface Props {
  toque: Toque;
  protocoloId: string;
  todosLosToques: Toque[];
  onReorder: () => void;
}

export function ToqueCard({ toque, protocoloId, todosLosToques, onReorder }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const canal = CANAL_CONFIG[toque.canal] ?? { label: toque.canal, color: "bg-gray-100 text-gray-700 border-gray-300" };

  async function handleMover(direccion: "arriba" | "abajo") {
    const sorted = [...todosLosToques].sort((a, b) => a.orden - b.orden);
    const idx = sorted.findIndex((t) => t.id === toque.id);
    const swapIdx = direccion === "arriba" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const nuevosOrdenes = sorted.map((t, i) => {
      if (i === idx) return { id: t.id, orden: sorted[swapIdx].orden };
      if (i === swapIdx) return { id: t.id, orden: sorted[idx].orden };
      return { id: t.id, orden: t.orden };
    });
    await reordenarToquesAction(nuevosOrdenes, protocoloId);
    onReorder();
  }

  async function handleGuardar(fd: FormData) {
    setGuardando(true);
    fd.append("id", toque.id);
    fd.append("protocolo_id", protocoloId);
    fd.append("orden", String(toque.orden));
    await upsertToqueAction(fd);
    setEditando(false);
    setGuardando(false);
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar "${toque.nombre}"?`)) return;
    await eliminarToqueAction(toque.id, protocoloId);
  }

  const sorted = [...todosLosToques].sort((a, b) => a.orden - b.orden);
  const idx = sorted.findIndex((t) => t.id === toque.id);

  return (
    <Card className="border border-muted">
      <CardHeader className="py-2 px-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => handleMover("arriba")} disabled={idx === 0} className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none">▲</button>
            <button onClick={() => handleMover("abajo")} disabled={idx === sorted.length - 1} className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none">▼</button>
          </div>
          <span className="text-xs font-bold text-muted-foreground w-5 text-center">{toque.orden}</span>
          <Badge className={`text-xs py-0 border shrink-0 ${canal.color}`}>{canal.label}</Badge>
          <span className="text-sm font-medium flex-1 truncate">{toque.nombre}</span>
          <span className="text-xs text-muted-foreground shrink-0">Día {toque.dia_offset + 1}</span>
          <button onClick={() => { setAbierto(!abierto); setEditando(false); }} className="text-xs text-muted-foreground hover:text-foreground ml-1">
            {abierto ? "▲" : "▼"}
          </button>
        </div>
      </CardHeader>

      {abierto && !editando && (
        <CardContent className="pt-0 pb-3 px-4 space-y-2">
          {toque.objetivo && <p className="text-xs text-muted-foreground"><span className="font-medium">Objetivo:</span> {toque.objetivo}</p>}
          {toque.guion_principal && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Guión principal:</p>
              <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-2">{toque.guion_principal}</pre>
            </div>
          )}
          {toque.guion_alternativo && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Si no contesta:</p>
              <pre className="text-xs whitespace-pre-wrap bg-blue-50 rounded p-2">{toque.guion_alternativo}</pre>
            </div>
          )}
          {toque.nota_interna && <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">{toque.nota_interna}</p>}
          {(toque.ventana_hora_inicio || toque.ventana_hora_fin) && (
            <p className="text-xs text-muted-foreground">Ventana: {toque.ventana_hora_inicio} – {toque.ventana_hora_fin}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={handleEliminar}>Eliminar</Button>
          </div>
        </CardContent>
      )}

      {abierto && editando && (
        <CardContent className="pt-0 pb-3 px-4">
          <form action={handleGuardar} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Nombre</label>
                <input name="nombre" defaultValue={toque.nombre} className="w-full text-sm border rounded px-2 py-1.5" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Canal</label>
                <select name="canal" defaultValue={toque.canal} className="w-full text-sm border rounded px-2 py-1.5">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="llamada">Llamada</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Día offset (0=día 1)</label>
                <input name="dia_offset" type="number" min="0" defaultValue={toque.dia_offset} className="w-full text-sm border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Objetivo</label>
                <input name="objetivo" defaultValue={toque.objetivo ?? ""} className="w-full text-sm border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ventana inicio</label>
                <input name="ventana_hora_inicio" type="time" defaultValue={toque.ventana_hora_inicio ?? ""} className="w-full text-sm border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ventana fin</label>
                <input name="ventana_hora_fin" type="time" defaultValue={toque.ventana_hora_fin ?? ""} className="w-full text-sm border rounded px-2 py-1.5" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Guión principal (usa [Nombre], [Vendedor], [LINK])</label>
              <textarea name="guion_principal" defaultValue={toque.guion_principal ?? ""} rows={4} className="w-full text-sm border rounded px-2 py-1.5 font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Guión alternativo (si no contesta — solo llamadas)</label>
              <textarea name="guion_alternativo" defaultValue={toque.guion_alternativo ?? ""} rows={2} className="w-full text-sm border rounded px-2 py-1.5 font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nota interna</label>
              <input name="nota_interna" defaultValue={toque.nota_interna ?? ""} className="w-full text-sm border rounded px-2 py-1.5" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
