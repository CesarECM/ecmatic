"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

const MENSAJE_DEFAULT = `Hola {nombre}, te contactamos desde Centro ECM. Hace un tiempo mostraste interés en las certificaciones CONOCER. ¿Sigues buscando opciones para certificar tus competencias laborales?`;

interface LeadProspeccion {
  id: string;
  nombre: string | null;
  telefono: string | null;
}

export function ReconexionStandalone() {
  const [leads, setLeads] = useState<LeadProspeccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(MENSAJE_DEFAULT);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/admin/prospeccion/leads-prospeccion")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setCargando(false));
  }, []);

  function toggleTodos() {
    if (seleccionados.size === leads.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(leads.map((l) => l.id)));
    }
  }

  async function enviar() {
    if (!seleccionados.size || !mensaje.trim()) return;
    setEnviando(true);
    const tid = toast.loading("Encolando mensajes…");

    const entradas = leads
      .filter((l) => seleccionados.has(l.id) && l.telefono)
      .map((l) => ({ leadId: l.id, telefono: l.telefono! }));

    if (!entradas.length) {
      toast.error("Los leads seleccionados no tienen teléfono", { id: tid });
      setEnviando(false);
      return;
    }

    const res = await fetch("/api/admin/prospeccion/reconexion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entradas, mensaje }),
    });

    if (res.ok) {
      const d = await res.json();
      toast.success(`${d.encolados} mensajes enviados a la cola de aprobación`, { id: tid });
      setSeleccionados(new Set());
    } else {
      toast.error("Error al encolar", { id: tid });
    }
    setEnviando(false);
  }

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando leads…</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Mensaje de reconexión</p>
        <p className="text-xs text-muted-foreground">Usa {"{nombre}"} para personalizar. Sin oferta.</p>
      </div>
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={4}
        className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-y"
      />

      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b">
          <input
            type="checkbox"
            checked={seleccionados.size === leads.length && leads.length > 0}
            onChange={toggleTodos}
            className="rounded"
          />
          <span className="text-xs font-medium">{leads.length} leads de lista propia</span>
          {seleccionados.size > 0 && (
            <span className="ml-auto text-xs text-primary">{seleccionados.size} seleccionados</span>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {!leads.length && (
            <p className="text-xs text-muted-foreground p-4">
              Sin leads de prospección. Importa un CSV primero.
            </p>
          )}
          {leads.map((l) => (
            <label key={l.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 hover:bg-muted/30 cursor-pointer">
              <input
                type="checkbox"
                checked={seleccionados.has(l.id)}
                onChange={() => {
                  setSeleccionados((prev) => {
                    const n = new Set(prev);
                    if (n.has(l.id)) n.delete(l.id); else n.add(l.id);
                    return n;
                  });
                }}
                className="rounded"
              />
              <span className="text-sm flex-1">{l.nombre ?? "Sin nombre"}</span>
              <span className="text-xs text-muted-foreground font-mono">{l.telefono ?? "—"}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={enviar}
        disabled={enviando || !seleccionados.size || !mensaje.trim()}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90"
      >
        {enviando ? "Encolando…" : `Enviar reconexión (${seleccionados.size} leads)`}
      </button>
    </div>
  );
}
