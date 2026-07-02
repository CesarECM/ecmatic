"use client";

import { useState } from "react";
import { toast } from "sonner";
import { actualizarCalendarioGhlAction } from "@/app/(dashboard)/admin/vendedores/actions";

interface Props {
  vendedorId: string;
  calendarIdInicial: string | null;
}

export function CalendarioGhlInput({ vendedorId, calendarIdInicial }: Props) {
  const [valor, setValor] = useState(calendarIdInicial ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const tid = toast.loading("Guardando calendario GHL…");
    try {
      await actualizarCalendarioGhlAction(vendedorId, valor);
      toast.success("Calendario GHL actualizado", { id: tid });
    } catch {
      toast.error("Error al guardar", { id: tid });
    } finally {
      setGuardando(false);
    }
  }

  const sinCambios = valor === (calendarIdInicial ?? "");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="flex-1 rounded border px-2 py-1.5 text-sm font-mono placeholder:text-muted-foreground"
          disabled={guardando}
        />
        <button
          onClick={guardar}
          disabled={guardando || sinCambios}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
        >
          Guardar
        </button>
      </div>
      {calendarIdInicial && (
        <p className="text-xs text-green-600">
          Calendario GHL activo — los slots de este vendedor se consultan vía GHL
        </p>
      )}
      {!calendarIdInicial && (
        <p className="text-xs text-muted-foreground">
          Sin configurar — se usará Google Calendar como fallback
        </p>
      )}
    </div>
  );
}
