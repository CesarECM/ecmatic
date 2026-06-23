"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { crearPagoAction, eliminarPagoAction, togglePagoActivoAction } from "../../actions";
import type { ServicioPago } from "@/services/servicio-pagos";

interface Props { servicioId: string; pagos: ServicioPago[] }

export function PagosCard({ servicioId, pagos }: Props) {
  const [pending, startTransition] = useTransition();

  function handleEliminar(pagoId: string) {
    const tid = toast.loading("Eliminando…");
    startTransition(async () => {
      try {
        await eliminarPagoAction(pagoId, servicioId);
        toast.success("Link eliminado", { id: tid });
      } catch { toast.error("Error", { id: tid }); }
    });
  }

  function handleToggle(pagoId: string, activo: boolean) {
    startTransition(async () => {
      await togglePagoActivoAction(pagoId, !activo, servicioId);
    });
  }

  function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("servicio_id", servicioId);
    const tid = toast.loading("Agregando link…");
    startTransition(async () => {
      try {
        await crearPagoAction(fd);
        toast.success("Link agregado", { id: tid });
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Links de pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pagos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin links de pago aún.</p>
        ) : (
          <div className="space-y-2">
            {pagos.map((p) => (
              <div key={p.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${!p.activo ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{p.tipo}</Badge>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                    {p.descripcion || p.url}
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

        <form onSubmit={handleCrear} className="border-t pt-3 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Agregar link</p>
          <div className="grid grid-cols-2 gap-2">
            <select name="tipo" className="text-sm border rounded-md px-3 py-1.5 bg-background">
              <option value="landing">Landing</option>
              <option value="pasarela">Pasarela de pago</option>
            </select>
            <Input name="descripcion" placeholder="Descripción (opcional)" className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Input name="url" required placeholder="https://…" className="text-sm flex-1" />
            <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
