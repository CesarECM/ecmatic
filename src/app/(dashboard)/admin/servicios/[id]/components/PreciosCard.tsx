"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { actualizarPreciosAction } from "../../actions";

interface Props {
  servicioId: string;
  precioCentavos: number | null;
  precioDescuentoCentavos: number | null;
  precioApartadoCentavos: number | null;
}

const toMXN = (c: number | null) => (c != null ? (c / 100).toFixed(2) : "");

export function PreciosCard({ servicioId, precioCentavos, precioDescuentoCentavos, precioApartadoCentavos }: Props) {
  const [pending, startTransition] = useTransition();

  const descuento = precioCentavos && precioDescuentoCentavos
    ? Math.round((1 - precioDescuentoCentavos / precioCentavos) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Precios</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("id", servicioId);
            const tid = toast.loading("Guardando precios…");
            startTransition(async () => {
              try {
                await actualizarPreciosAction(fd);
                toast.success("Precios actualizados", { id: tid });
              } catch {
                toast.error("Error al guardar", { id: tid });
              }
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Precio de lista (MXN)</label>
              <div className="flex items-center border rounded-md px-3 py-1.5 text-sm bg-background gap-1">
                <span className="text-muted-foreground">$</span>
                <input
                  name="precio_lista"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={toMXN(precioCentavos)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Precio con descuento (MXN)</label>
              <div className="flex items-center border rounded-md px-3 py-1.5 text-sm bg-background gap-1">
                <span className="text-muted-foreground">$</span>
                <input
                  name="precio_descuento"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={toMXN(precioDescuentoCentavos)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {descuento !== null && (
            <p className="text-xs text-green-600 font-medium">
              Descuento activo: {descuento}% sobre precio de lista
            </p>
          )}

          <div className="space-y-1 border-t pt-3">
            <label className="text-xs text-muted-foreground">Monto mínimo de apartado (MXN) — opcional</label>
            <div className="flex items-center border rounded-md px-3 py-1.5 text-sm bg-background gap-1">
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
            <p className="text-xs text-muted-foreground">
              Si se configura, la IA ofrecerá apartar el lugar con este monto cuando el lead dude por el precio.
            </p>
          </div>

          <Button type="submit" size="sm" disabled={pending}>Guardar precios</Button>
        </form>
      </CardContent>
    </Card>
  );
}
