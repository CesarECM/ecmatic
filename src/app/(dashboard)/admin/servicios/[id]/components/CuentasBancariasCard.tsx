"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearCuentaAction, eliminarCuentaAction, toggleCuentaActivaAction } from "../../actions";
import type { CuentaBancaria } from "@/services/cuentas-bancarias";

interface Props {
  servicioId: string;
  cuentas: CuentaBancaria[];
}

export function CuentasBancariasCard({ servicioId, cuentas }: Props) {
  const [pending, startTransition] = useTransition();

  function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tid = toast.loading("Guardando cuenta…");
    startTransition(async () => {
      try {
        await crearCuentaAction(fd, servicioId);
        toast.success("Cuenta agregada", { id: tid });
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  function handleEliminar(cuentaId: string) {
    startTransition(async () => {
      await eliminarCuentaAction(cuentaId, servicioId);
      toast.success("Cuenta eliminada");
    });
  }

  function handleToggle(cuentaId: string, activa: boolean) {
    startTransition(async () => {
      await toggleCuentaActivaAction(cuentaId, !activa, servicioId);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cuentas bancarias para transferencia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            Estas cuentas son <strong>globales</strong> — aplican a todos los servicios y al apartado.
            Cualquier cambio aquí se verá reflejado en toda la plataforma.
          </span>
        </div>

        {cuentas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cuentas bancarias configuradas.</p>
        ) : (
          <div className="space-y-2">
            {cuentas.map((c) => (
              <div key={c.id} className={`rounded border px-3 py-2 text-sm space-y-0.5 ${!c.activa ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">{c.banco} — {c.titular}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      onClick={() => handleToggle(c.id, c.activa)}
                      disabled={pending}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {c.activa ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => handleEliminar(c.id)} disabled={pending} className="text-xs text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </div>
                </div>
                {c.clabe   && <p className="text-xs text-muted-foreground">CLABE: {c.clabe}</p>}
                {c.cuenta  && <p className="text-xs text-muted-foreground">Cuenta: {c.cuenta}</p>}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleCrear} className="border-t pt-3 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Agregar cuenta</p>
          <div className="grid grid-cols-2 gap-2">
            <Input name="banco"   required placeholder="Banco *"   className="text-sm" />
            <Input name="titular" required placeholder="Titular *" className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="clabe"  placeholder="CLABE (opcional)"   className="text-sm" />
            <Input name="cuenta" placeholder="# Cuenta (opcional)" className="text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Input name="orden" type="number" defaultValue="0" placeholder="Orden" className="text-sm w-20" />
            <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
          </div>
        </form>

      </CardContent>
    </Card>
  );
}
