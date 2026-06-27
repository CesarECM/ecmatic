"use client";

import { useState, useTransition } from "react";
import { agregarUsuarioPruebaAction } from "../actions";

interface Perfil { id: string; nombre: string | null; email: string; rol: string }

export function AgregarUsuarioPruebaForm({ perfiles }: { perfiles: Perfil[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await agregarUsuarioPruebaAction(fd);
      if (res.ok) {
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
      } else {
        setError(res.error ?? "Error desconocido");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-card space-y-3">
      <h3 className="font-medium text-sm">Agregar usuario de prueba</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Teléfono (con código de país)</label>
          <input
            name="telefono"
            required
            placeholder="+5214431237032"
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <input
            name="nombre"
            required
            placeholder="César García"
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>
      </div>

      {perfiles.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Perfil ECMatic (opcional — si es del equipo)</label>
          <select name="perfil_id" className="w-full border rounded px-3 py-1.5 text-sm bg-background">
            <option value="">— Externo / sin perfil —</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre ?? p.email} ({p.rol})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-green-600">Usuario agregado correctamente.</p>}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Agregar"}
      </button>
    </form>
  );
}
