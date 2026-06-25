"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { upsertEtiquetaAction, eliminarEtiquetaAction } from "@/app/(dashboard)/admin/protocolos/actions";
import type { EtiquetaDiagnostico } from "@/services/protocolos-seguimiento";

const INPUT = "text-sm border rounded px-2 py-1.5 w-full";

interface Props {
  etiquetas: EtiquetaDiagnostico[];
  protocoloId: string;
}

function FilaEditable({ etiqueta, protocoloId, onCancel }: { etiqueta: Partial<EtiquetaDiagnostico>; protocoloId: string; onCancel: () => void }) {
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(fd: FormData) {
    setGuardando(true);
    fd.append("protocolo_id", protocoloId);
    if (etiqueta.id) fd.append("id", etiqueta.id);
    await upsertEtiquetaAction(fd);
    setGuardando(false);
    onCancel();
  }

  return (
    <tr className="border-t bg-muted/30">
      <td colSpan={4} className="p-2">
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input name="etiqueta" defaultValue={etiqueta.etiqueta ?? ""} placeholder="Nombre de la etiqueta" className={INPUT} required />
          <input name="que_significa" defaultValue={etiqueta.que_significa ?? ""} placeholder="¿Qué significa?" className={INPUT} />
          <input name="que_indica" defaultValue={etiqueta.que_indica ?? ""} placeholder="¿Qué indica?" className={INPUT} />
          <div className="md:col-span-3 flex gap-2">
            <Button type="submit" size="sm" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function EtiquetasTable({ etiquetas, protocoloId }: Props) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar etiqueta?")) return;
    await eliminarEtiquetaAction(id, protocoloId);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Estas etiquetas permiten clasificar el resultado de cada lead y detectar si el problema es el proceso o la calidad del lead.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2">Etiqueta</th>
              <th className="text-left px-3 py-2">Qué significa</th>
              <th className="text-left px-3 py-2">Qué indica</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {etiquetas.map((e) => (
              editandoId === e.id ? (
                <FilaEditable key={e.id} etiqueta={e} protocoloId={protocoloId} onCancel={() => setEditandoId(null)} />
              ) : (
                <tr key={e.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{e.etiqueta}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.que_significa}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.que_indica}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditandoId(e.id)} className="text-xs text-muted-foreground hover:text-foreground mr-3">Editar</button>
                    <button onClick={() => handleEliminar(e.id)} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </td>
                </tr>
              )
            ))}
            {agregando && (
              <FilaEditable etiqueta={{ protocolo_id: protocoloId }} protocoloId={protocoloId} onCancel={() => setAgregando(false)} />
            )}
            {!etiquetas.length && !agregando && (
              <tr><td colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sin etiquetas definidas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!agregando && (
        <Button size="sm" variant="outline" onClick={() => setAgregando(true)}>+ Agregar etiqueta</Button>
      )}
    </div>
  );
}
