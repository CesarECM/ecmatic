"use client";

import { useState } from "react";
import { toast } from "sonner";
import { agregarVendedorAction } from "@/app/(dashboard)/admin/vendedores/actions";

export function AgregarVendedorBtn() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function handleGuardar() {
    setGuardando(true);
    const tid = toast.loading("Creando vendedor…");
    try {
      await agregarVendedorAction(nombre, email);
      toast.success("Vendedor agregado — se envió invitación por email", { id: tid });
      setNombre("");
      setEmail("");
      setAbierto(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado", { id: tid });
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded border bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
      >
        + Agregar vendedor
      </button>
    );
  }

  return (
    <div className="rounded border bg-gray-50 p-4 shadow-sm w-72">
      <p className="mb-3 text-sm font-medium">Nuevo vendedor</p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded border px-2.5 py-1.5 text-sm"
          disabled={guardando}
        />
        <input
          type="email"
          placeholder="Email corporativo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-2.5 py-1.5 text-sm"
          disabled={guardando}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleGuardar}
          disabled={guardando || !nombre.trim() || !email.trim()}
          className="rounded bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Guardar
        </button>
        <button
          onClick={() => { setAbierto(false); setNombre(""); setEmail(""); }}
          disabled={guardando}
          className="rounded border px-3 py-1.5 text-xs hover:bg-white"
        >
          Cancelar
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Si el usuario ya existe en el sistema, se vincula directamente sin reenviar invitación.
      </p>
    </div>
  );
}
