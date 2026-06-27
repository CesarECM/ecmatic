"use client";

import { useState, useTransition } from "react";
import {
  resetearUnoAction,
  resetearTodosAction,
  agregarACampanaAction,
  eliminarUsuarioPruebaAction,
} from "../actions";
import type { EstadoUsuarioPrueba } from "@/services/usuarios-prueba";

function Badge({ label, variant }: { label: string; variant: "green" | "yellow" | "gray" | "red" }) {
  const cls = {
    green:  "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    gray:   "bg-muted text-muted-foreground",
    red:    "bg-red-100 text-red-700",
  }[variant];
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

function AccionBtn({
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
}) {
  const cls = {
    default:     "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline:     "border bg-background hover:bg-muted",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}

function FilaUsuario({ usuario, onMsg }: { usuario: EstadoUsuarioPrueba; onMsg: (m: string) => void }) {
  const [pending, startTransition] = useTransition();

  function reset() {
    const msg = usuario.es_admin_ecmatic
      ? `Este número pertenece a un admin de ECMatic. ¿Continuar con el reset?`
      : `¿Resetear a ${usuario.nombre}?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await resetearUnoAction(usuario.id);
      onMsg(res.ok ? `Reset OK — ${res.detalles}` : `Error: ${res.error}`);
    });
  }

  function campana() {
    startTransition(async () => {
      const res = await agregarACampanaAction(usuario.id);
      onMsg(res.ok ? `Añadido a campaña (variante ${res.variante})` : `Error: ${res.error}`);
    });
  }

  function eliminar() {
    if (!confirm(`¿Quitar ${usuario.nombre} de la lista de prueba? (no resetea sus datos)`)) return;
    startTransition(async () => {
      await eliminarUsuarioPruebaAction(usuario.id);
    });
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2.5 text-sm">
        <div className="font-medium">{usuario.nombre}</div>
        <div className="text-xs text-muted-foreground font-mono">{usuario.telefono}</div>
        {usuario.es_admin_ecmatic && (
          <Badge label="Admin ECMatic" variant="yellow" />
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          <Badge label={usuario.tiene_lead ? "Lead activo" : "Sin lead"} variant={usuario.tiene_lead ? "green" : "gray"} />
          <Badge label={usuario.en_campana ? "En campaña" : "Sin campaña"} variant={usuario.en_campana ? "yellow" : "gray"} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1.5 items-center">
          <AccionBtn label="Reset" onClick={reset} variant="destructive" disabled={pending} />
          <AccionBtn label="+ Campaña" onClick={campana} variant="outline" disabled={pending} />
          <AccionBtn label="Quitar" onClick={eliminar} variant="outline" disabled={pending} />
        </div>
      </td>
    </tr>
  );
}

export function UsuariosPruebaList({ usuarios }: { usuarios: EstadoUsuarioPrueba[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingTodos, startTodos] = useTransition();

  function resetTodos() {
    if (!confirm(`¿Resetear TODOS los ${usuarios.length} usuarios de prueba? Esto borrará su historial en ECMatic y GHL.`)) return;
    startTodos(async () => {
      const res = await resetearTodosAction();
      setMsg(`Reset masivo: ${res.procesados} OK, ${res.errores} errores.`);
    });
  }

  if (!usuarios.length) {
    return <p className="text-sm text-muted-foreground py-4">No hay usuarios de prueba registrados.</p>;
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className="text-xs px-3 py-2 rounded border bg-muted">{msg}</div>
      )}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Usuario</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Estado</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <FilaUsuario key={u.id} usuario={u} onMsg={setMsg} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button
          onClick={resetTodos}
          disabled={pendingTodos}
          className="px-4 py-1.5 rounded bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50"
        >
          {pendingTodos ? "Reseteando…" : "Reset todos"}
        </button>
      </div>
    </div>
  );
}
