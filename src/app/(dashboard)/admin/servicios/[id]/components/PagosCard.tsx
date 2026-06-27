"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearPagoAction, eliminarPagoAction, togglePagoActivoAction } from "../../actions";
import type { ServicioPago } from "@/services/servicio-pagos";

interface Props { servicioId: string; pagos: ServicioPago[] }

export function PagosCard({ servicioId, pagos }: Props) {
  const [pending, startTransition] = useTransition();
  const apoyos   = pagos.filter(p => p.tipo === "landing");
  const directos = pagos.filter(p => p.tipo === "pasarela");

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

  // Devuelve un handler para el tipo indicado — evita duplicar lógica
  function handleCrear(tipo: "landing" | "pasarela") {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("servicio_id", servicioId);
      fd.set("tipo", tipo);
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
    };
  }

  function renderLista(lista: ServicioPago[]) {
    if (!lista.length) return <p className="text-xs text-muted-foreground">Sin links aún.</p>;
    return (
      <div className="space-y-2">
        {lista.map((p) => (
          <div key={p.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${!p.activo ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium shrink-0">{p.nombre}</span>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                {p.url}
              </a>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button onClick={() => handleToggle(p.id, p.activo)} disabled={pending} className="text-xs text-muted-foreground hover:text-foreground">
                {p.activo ? "Desactivar" : "Activar"}
              </button>
              <button onClick={() => handleEliminar(p.id)} disabled={pending} className="text-xs text-red-600 hover:underline">
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Links de apoyo — la IA los comparte mientras el lead evalúa */}
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Links de apoyo</p>
            <p className="text-xs text-muted-foreground">La IA los comparte cuando el lead está evaluando la oferta.</p>
          </div>
          {renderLista(apoyos)}
          <form onSubmit={handleCrear("landing")} className="border-t pt-3">
            <div className="flex gap-2">
              <Input name="nombre" required placeholder="Nombre *" className="text-sm" />
              <Input name="url" required placeholder="https://…" className="text-sm flex-1" />
              <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
            </div>
          </form>
        </div>

        {/* Links de pago directo — la IA los comparte cuando el lead decide comprar */}
        <div className="border-t pt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Links de pago directo</p>
            <p className="text-xs text-muted-foreground">La IA los comparte cuando el lead está listo para comprar.</p>
          </div>
          {renderLista(directos)}
          <form onSubmit={handleCrear("pasarela")} className="border-t pt-3">
            <div className="flex gap-2">
              <Input name="nombre" required placeholder="Nombre *" className="text-sm" />
              <Input name="url" required placeholder="https://…" className="text-sm flex-1" />
              <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
            </div>
          </form>
        </div>

      </CardContent>
    </Card>
  );
}
