"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { upsertCriterioAction, eliminarCriterioAction } from "@/app/(dashboard)/admin/protocolos/actions";
import type { CriterioDescarte } from "@/services/protocolos-seguimiento";

const INPUT = "text-sm border rounded px-2 py-1.5 w-full";

interface Props {
  criterios: CriterioDescarte[];
  protocoloId: string;
}

function FilaEditable({ criterio, protocoloId, onCancel }: { criterio: Partial<CriterioDescarte>; protocoloId: string; onCancel: () => void }) {
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(fd: FormData) {
    setGuardando(true);
    fd.append("protocolo_id", protocoloId);
    if (criterio.id) fd.append("id", criterio.id);
    fd.append("orden", String(criterio.orden ?? 0));
    await upsertCriterioAction(fd);
    setGuardando(false);
    onCancel();
  }

  return (
    <tr className="border-t bg-muted/30">
      <td colSpan={5} className="p-2">
        <form action={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input name="senal" defaultValue={criterio.senal ?? ""} placeholder="Señal del lead" className={INPUT} required />
          <input name="diagnostico" defaultValue={criterio.diagnostico ?? ""} placeholder="Diagnóstico" className={INPUT} required />
          <input name="accion" defaultValue={criterio.accion ?? ""} placeholder="Acción a tomar" className={INPUT} required />
          <input name="etiqueta_resultado" defaultValue={criterio.etiqueta_resultado ?? ""} placeholder="Etiqueta (opcional)" className={INPUT} />
          <div className="col-span-2 md:col-span-4 flex gap-2">
            <Button type="submit" size="sm" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function CriteriosTable({ criterios, protocoloId }: Props) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar criterio?")) return;
    await eliminarCriterioAction(id, protocoloId);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2">Señal del lead</th>
              <th className="text-left px-3 py-2">Diagnóstico</th>
              <th className="text-left px-3 py-2">Acción</th>
              <th className="text-left px-3 py-2">Etiqueta</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {criterios.map((c) => (
              editandoId === c.id ? (
                <FilaEditable key={c.id} criterio={c} protocoloId={protocoloId} onCancel={() => setEditandoId(null)} />
              ) : (
                <tr key={c.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2">{c.senal}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.diagnostico}</td>
                  <td className="px-3 py-2">{c.accion}</td>
                  <td className="px-3 py-2">
                    {c.etiqueta_resultado && (
                      <span className="rounded-full bg-violet-100 text-violet-700 text-xs px-2 py-0.5">{c.etiqueta_resultado}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditandoId(c.id)} className="text-xs text-muted-foreground hover:text-foreground mr-3">Editar</button>
                    <button onClick={() => handleEliminar(c.id)} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </td>
                </tr>
              )
            ))}
            {agregando && (
              <FilaEditable criterio={{ protocolo_id: protocoloId, orden: criterios.length }} protocoloId={protocoloId} onCancel={() => setAgregando(false)} />
            )}
            {!criterios.length && !agregando && (
              <tr><td colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sin criterios definidos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!agregando && (
        <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>+ Agregar criterio</Button>
      )}
    </div>
  );
}
