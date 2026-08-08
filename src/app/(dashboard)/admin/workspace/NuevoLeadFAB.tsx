"use client";

import { useState } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { crearNuevoLeadWorkspaceAction } from "./actions";
import type { OportunidadRow } from "@/services/oportunidades";

export function NuevoLeadFAB() {
  const { addLeadToPanel, selectLead } = useWorkspace();

  const [open,      setOpen]      = useState(false);
  const [telefono,  setTelefono]  = useState("");
  const [nombre,    setNombre]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{ leadId: string; op: OportunidadRow | null } | null>(null);

  function cerrar() {
    setOpen(false);
    setTelefono("");
    setNombre("");
    setError(null);
    setDuplicado(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDuplicado(null);

    const res = await crearNuevoLeadWorkspaceAction(telefono.trim(), nombre.trim() || null);
    setLoading(false);

    if (!res.ok) { setError(res.error); return; }

    if (res.duplicado) {
      setDuplicado({ leadId: res.leadId, op: res.op });
      return;
    }

    addLeadToPanel(res.op);
    cerrar();
  }

  function irAlDuplicado() {
    if (!duplicado) return;
    // si está en el panel usamos selectLead (no add, para no duplicar en la lista)
    selectLead(duplicado.leadId, duplicado.op);
    cerrar();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
        title="Nuevo lead"
        aria-label="Nuevo lead"
      >
        <span className="text-xl leading-none select-none">＋</span>
      </button>

      {open && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
        >
          <div className="bg-card border rounded-lg shadow-xl w-80 p-5">
            <h2 className="text-sm font-semibold mb-4">Nuevo lead</h2>

            {duplicado ? (
              <div className="space-y-3">
                <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                  Ya existe un lead con ese número de teléfono.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setDuplicado(null)}
                    className="text-xs px-3 py-1.5 rounded border hover:bg-muted/60 transition-colors"
                  >
                    Volver
                  </button>
                  <button
                    onClick={irAlDuplicado}
                    className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Ir al lead ↗
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Teléfono <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="5512345678"
                    required
                    autoFocus
                    className="w-full text-sm border rounded px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Nombre (opcional)
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre del lead"
                    className="w-full text-sm border rounded px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={cerrar}
                    className="text-xs px-3 py-1.5 rounded border hover:bg-muted/60 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Creando…" : "Crear lead"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
