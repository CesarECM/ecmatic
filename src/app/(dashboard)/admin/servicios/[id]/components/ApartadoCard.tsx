"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  actualizarApartadoAction, crearPagoAction, eliminarPagoAction, togglePagoActivoAction,
} from "../../actions";
import type { ServicioPago } from "@/services/servicio-pagos";

interface Props {
  servicioId: string;
  precioApartadoCentavos: number | null;
  pagosApartado: ServicioPago[];
}

const toMXN = (c: number | null) => (c != null ? (c / 100).toFixed(2) : "");

export function ApartadoCard({ servicioId, precioApartadoCentavos, pagosApartado }: Props) {
  const [pending, startTransition] = useTransition();

  function handleMonto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", servicioId);
    const tid = toast.loading("Guardando…");
    startTransition(async () => {
      try {
        await actualizarApartadoAction(fd);
        toast.success("Monto de apartado actualizado", { id: tid });
      } catch { toast.error("Error al guardar", { id: tid }); }
    });
  }

  function handleCrearLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("servicio_id", servicioId);
    fd.set("tipo", "apartado");
    const tid = toast.loading("Agregando link…");
    startTransition(async () => {
      try {
        await crearPagoAction(fd);
        toast.success("Link de apartado agregado", { id: tid });
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  function handleEliminar(pagoId: string) {
    const tid = toast.loading("Eliminando…");
    startTransition(async () => {
      try {
        await eliminarPagoAction(pagoId, servicioId);
        toast.success("Link eliminado", { id: tid });
      } catch { toast.error("Error al eliminar", { id: tid }); }
    });
  }

  function handleToggle(pagoId: string, activo: boolean) {
    startTransition(async () => {
      try {
        await togglePagoActivoAction(pagoId, !activo, servicioId);
      } catch { toast.error("Error al cambiar estado"); }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Apartado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Monto */}
        <form onSubmit={handleMonto} className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Monto mínimo de apartado (MXN)</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md px-3 py-1.5 text-sm bg-background gap-1 flex-1">
              <span className="text-muted-foreground">$</span>
              <input
                name="precio_apartado"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toMXN(precioApartadoCentavos)}
                placeholder="0.00"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>Guardar</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Si se configura, la IA ofrecerá apartar el lugar con este monto cuando el lead dude por el precio.
          </p>
        </form>

        {/* Links de pago tipo apartado */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs text-muted-foreground font-medium">Links de pago para apartado</p>

          {pagosApartado.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin links de apartado aún.</p>
          ) : (
            <div className="space-y-2">
              {pagosApartado.map((p) => (
                <div key={p.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${!p.activo ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium shrink-0">{p.nombre}</span>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                      {p.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button
                      onClick={() => handleToggle(p.id, p.activo)}
                      disabled={pending}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => handleEliminar(p.id)} disabled={pending} className="text-xs text-red-600 hover:underline">
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCrearLink} className="space-y-2">
            <Input name="nombre" required placeholder="Nombre del link *" className="text-sm" />
            <div className="flex gap-2">
              <Input name="url" required placeholder="https://…" className="text-sm flex-1" />
              <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
            </div>
          </form>

          <p className="text-xs text-muted-foreground">
            Las cuentas bancarias para transferencia también aplican al apartado — configúralas en la sección de abajo.
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
