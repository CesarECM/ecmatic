"use client";

import { useState } from "react";
import { toast } from "sonner";
import { actualizarPesoAction } from "@/app/(dashboard)/admin/vendedores/actions";

interface Props {
  vendedorId: string;
  pesoInicial: number;
}

export function PesoInput({ vendedorId, pesoInicial }: Props) {
  const [peso, setPeso] = useState(pesoInicial);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const tid = toast.loading("Guardando peso…");
    try {
      await actualizarPesoAction(vendedorId, peso);
      toast.success("Peso actualizado", { id: tid });
    } catch {
      toast.error("Error al guardar", { id: tid });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <input
        type="number"
        min={0}
        max={100}
        value={peso}
        onChange={(e) => setPeso(Math.min(100, Math.max(0, Number(e.target.value))))}
        className="w-14 rounded border px-1.5 py-0.5 text-center text-sm"
        disabled={guardando}
      />
      <button
        onClick={guardar}
        disabled={guardando || peso === pesoInicial}
        className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-40"
      >
        OK
      </button>
    </div>
  );
}
