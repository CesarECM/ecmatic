"use client";

import { useState, useTransition } from "react";
import { registrarPagoManualAction } from "../actions";

interface Lead { id: string; nombre: string | null; telefono: string | null }

export function NuevoPagoForm({ leads }: { leads: Lead[] }) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await registrarPagoManualAction(fd);
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)}
        className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
        + Registrar pago manual
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border bg-card p-4 space-y-3 max-w-md">
      <p className="font-medium text-sm">Nuevo pago manual</p>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Lead</label>
        <select name="lead_id" required className="w-full rounded border px-2 py-1.5 text-sm">
          <option value="">Seleccionar lead…</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre ?? l.telefono ?? l.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Monto (MXN)</label>
        <input name="monto" type="number" min="1" step="0.01" required
          className="w-full rounded border px-2 py-1.5 text-sm" placeholder="1799.00" />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">URL del comprobante (opcional)</label>
        <input name="comprobante_url" type="url"
          className="w-full rounded border px-2 py-1.5 text-sm" placeholder="https://…" />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notas</label>
        <input name="notas" className="w-full rounded border px-2 py-1.5 text-sm"
          placeholder="Transferencia BBVA, referencia…" />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? "Registrando…" : "Registrar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
